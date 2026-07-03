import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import compress from '@fastify/compress';
import { query, closeDatabase } from '../db/connection.js';
import { createWriteStream, mkdirSync } from 'fs';
import { unlink, readFile, readdir, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createGunzip, gzipSync, gunzipSync } from 'zlib';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { isGitHubAppEnabled, processTestRun, verifyAuthentication, verifyAndCacheAuth, getGitHubAppStatus } from './github.js';
import { calculateTestStats, calculateSuiteStats } from './testStats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.json.gz', '.json.bz2'];

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  },
  bodyLimit: 100 * 1024 * 1024 // 100MB limit for file uploads
});

function getNormalizedLowerFileName(fileName) {
  return String(fileName || '').toLowerCase();
}

function hasSupportedResultExtension(fileName) {
  const normalized = getNormalizedLowerFileName(fileName);
  return SUPPORTED_IMPORT_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

function stripResultExtension(fileName) {
  let base = String(fileName || 'run');
  const lower = base.toLowerCase();

  if (lower.endsWith('.json.bz2')) {
    return base.slice(0, -9);
  }
  if (lower.endsWith('.json.gz')) {
    return base.slice(0, -8);
  }
  if (lower.endsWith('.json')) {
    return base.slice(0, -5);
  }

  return base;
}

function sanitizeRunTitle(title) {
  const sanitized = String(title || 'run').trim().replace(/\s+/g, ' ');
  return sanitized || 'run';
}

function sanitizeEngineName(value, fallback = 'unknown-engine') {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function sanitizeEngineVersion(value, fallback = 'unknown') {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function normalizeUploadSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'manual' || normalized === 'ci') {
    return normalized;
  }
  return null;
}

function deriveUploadSource({ uploadSource, workflowRunId, repoFullName }) {
  if (uploadSource) return uploadSource;
  if (workflowRunId) return 'ci';
  if (String(repoFullName || '').toLowerCase().startsWith('manual/')) return 'manual';
  return 'unknown';
}

function getSourceWhereClause(source) {
  if (source === 'manual') {
    return {
      clause: "workflow_run_id IS NULL AND (lower(repo_full_name) LIKE 'manual/%' OR lower(repo_full_name) LIKE 'local/%')",
      params: []
    };
  }
  if (source === 'ci') {
    return {
      clause: 'workflow_run_id IS NOT NULL',
      params: []
    };
  }
  if (source === 'unknown') {
    return {
      clause: "workflow_run_id IS NULL AND lower(repo_full_name) NOT LIKE 'manual/%' AND lower(repo_full_name) NOT LIKE 'local/%'",
      params: []
    };
  }
  return { clause: null, params: [] };
}

function getSourceFolderName(dirPath) {
  const value = String(dirPath || '').trim();
  if (!value) return 'local';

  const name = basename(value);
  return name || 'local';
}

function getPrivateRepoName(sourceFolderName) {
  return `local/${sourceFolderName || 'local'}`;
}

function getPrivateRunMetadata({ fileName, sourceFolderName }) {
  const baseTitle = sanitizeRunTitle(stripResultExtension(fileName));

  return {
    repoFullName: getPrivateRepoName(sourceFolderName),
    commitSha: null,
    engineName: sanitizeEngineName(sourceFolderName, 'local'),
    engineVersion: 'manual',
    runTitle: baseTitle,
    prNumber: null,
    refName: sourceFolderName || 'local',
    headRef: null,
    refKind: 'branch',
    workflowRunId: null,
    artifactUrl: null
  };
}

function getPrivateImportMetadata({ filePath, rootDir, sourceFolderName, fileName }) {
  const relativePath = relative(rootDir, filePath);
  const normalized = String(relativePath || '').split('\\').join('/');
  const parts = normalized.split('/').filter(Boolean);

  let engineName = sourceFolderName || 'local';
  let engineVersion = 'unknown';

  if (parts.length >= 3) {
    engineName = parts[0];
    engineVersion = parts[1];
  } else if (parts.length === 2) {
    engineName = parts[0];
  }

  return {
    repoFullName: getPrivateRepoName(sourceFolderName),
    commitSha: null,
    engineName: sanitizeEngineName(engineName, 'local'),
    engineVersion: sanitizeEngineVersion(engineVersion, 'unknown'),
    runTitle: sanitizeRunTitle(stripResultExtension(fileName)),
    prNumber: null,
    refName: sanitizeEngineVersion(engineVersion, sourceFolderName || 'local'),
    headRef: null,
    refKind: 'branch',
    workflowRunId: null,
    artifactUrl: null
  };
}

function getSurfaceGuard(allowedSurfaces) {
  return async function surfaceGuard(request, reply) {
    if (config.apiSurface === 'all' || allowedSurfaces.includes(config.apiSurface)) {
      return;
    }

    return reply.code(404).send({
      error: 'Not Found',
      message: 'Endpoint is not available in the current API surface mode'
    });
  };
}

const requireReadSurface = getSurfaceGuard(['read']);
const requireUploadSurface = getSurfaceGuard(['upload']);

function getUniqueRunTitle(baseTitle, repoFullName, commitSha) {
  const sql = commitSha == null
    ? `SELECT run_title
       FROM test_suite_runs
       WHERE repo_full_name = ? AND commit_sha IS NULL`
    : `SELECT run_title
       FROM test_suite_runs
       WHERE repo_full_name = ? AND commit_sha = ?`;

  const stmt = query(sql);
  const existingRows = commitSha == null ? stmt.all(repoFullName) : stmt.all(repoFullName, commitSha);

  const existing = new Set(
    existingRows
      .map((row) => row.run_title)
      .filter((title) => typeof title === 'string' && title.length > 0)
  );

  if (!existing.has(baseTitle)) {
    return baseTitle;
  }

  let counter = 1;
  while (existing.has(`${baseTitle}_${counter}`)) {
    counter += 1;
  }

  return `${baseTitle}_${counter}`;
}

async function collectResultFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && hasSupportedResultExtension(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  files.sort();
  return files;
}

async function importLocalResultsDirectory(rootDir) {
  const normalizedDir = String(rootDir || '').trim();
  if (!normalizedDir) {
    fastify.log.warn('Private mode is enabled but LOCAL_RESULTS_DIR is not set. Skipping auto import.');
    return;
  }

  let directoryStats;
  try {
    directoryStats = await stat(normalizedDir);
  } catch {
    fastify.log.error(`LOCAL_RESULTS_DIR does not exist: ${normalizedDir}`);
    return;
  }

  if (!directoryStats.isDirectory()) {
    fastify.log.error(`LOCAL_RESULTS_DIR is not a directory: ${normalizedDir}`);
    return;
  }

  const sourceFolderName = getSourceFolderName(normalizedDir);
  const files = await collectResultFiles(normalizedDir);

  if (files.length === 0) {
    fastify.log.warn(`No result files found in LOCAL_RESULTS_DIR (${normalizedDir}).`);
    return;
  }

  fastify.log.info(`Private mode import: found ${files.length} files in ${normalizedDir}`);

  let importedCount = 0;
  let failedCount = 0;

  for (const filePath of files) {
    const fileName = basename(filePath);

    try {
      const jsonContent = await decompressFile(filePath, fileName);
      const resultsJson = JSON.parse(jsonContent);
      const stats = calculateTestStats(resultsJson);

      const privateMetadata = getPrivateImportMetadata({
        filePath,
        rootDir: normalizedDir,
        sourceFolderName,
        fileName
      });

      const compressedData = compressForStorage(jsonContent);
      const runTitle = getUniqueRunTitle(privateMetadata.runTitle, privateMetadata.repoFullName, privateMetadata.commitSha);
      const suiteStats = calculateSuiteStats(resultsJson);

      const stmt = query(
        `INSERT INTO test_suite_runs (
          repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
          workflow_run_id, total, passed, failed, intended, skipped,
          suite_stats, artifact_url, results_json, compression_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        privateMetadata.repoFullName,
        runTitle,
        privateMetadata.commitSha,
        privateMetadata.engineName,
        privateMetadata.engineVersion,
        privateMetadata.prNumber,
        privateMetadata.refName,
        privateMetadata.headRef,
        privateMetadata.refKind,
        privateMetadata.workflowRunId,
        stats.total,
        stats.passed,
        stats.failed,
        stats.intended,
        stats.skipped,
        JSON.stringify(suiteStats),
        privateMetadata.artifactUrl,
        compressedData,
        'gzip'
      );

      importedCount += 1;
    } catch (error) {
      failedCount += 1;
      fastify.log.error(`Failed to import ${fileName}: ${error.message}`);
    }
  }

  fastify.log.info(`Private mode import finished: ${importedCount} imported, ${failedCount} failed`);
}

// Register CORS — public API: allow any origin. The read API serves public data and uploads
// are protected by the x-api-key header, not by origin. No credentials are used.
await fastify.register(cors, {
  origin: '*'
});

// Register compression for HTTP responses (gzip/brotli)
// This automatically compresses responses based on Accept-Encoding header
await fastify.register(compress, {
  global: true,
  threshold: 1024, // Only compress responses larger than 1KB
  encodings: ['gzip', 'deflate'], // Prioritize gzip for broad browser support
});

// Register multipart for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

/**
 * API Key authentication hook for protected endpoints
 */
const authenticateApiKey = async (request, reply) => {
  if (config.isPrivateMode) {
    return;
  }

  const apiKey = request.headers['x-api-key'];
  const expectedApiKey = config.apiKey;

  if (!expectedApiKey) {
    fastify.log.warn('API_KEY environment variable not set - upload endpoint will be unprotected!');
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }
};

/**
 * API Key authentication hook for the destructive DELETE endpoint.
 * Uses config.deleteApiKey (DELETE_API_KEY, falling back to API_KEY).
 */
const authenticateDeleteKey = async (request, reply) => {
  if (config.isPrivateMode) {
    return; // same as upload: local single-user mode skips auth
  }

  const apiKey = request.headers['x-api-key'];
  const expectedApiKey = config.deleteApiKey;

  if (!expectedApiKey) {
    fastify.log.warn('Neither DELETE_API_KEY nor API_KEY is set - delete endpoint will be unprotected!');
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }
};

/**
 * Compress JSON string using gzip for efficient DB storage
 * @param {string} jsonString - JSON string to compress
 * @returns {Buffer} - Compressed data as Buffer
 */
function compressForStorage(jsonString) {
  return gzipSync(Buffer.from(jsonString, 'utf-8'));
}

/**
 * Decompress gzip data from DB storage
 * @param {Buffer|string} compressed - Compressed data (Buffer or base64 string)
 * @returns {string} - Decompressed JSON string
 */
function decompressFromStorage(compressed) {
  if (!compressed) return null;
  
  // Handle both Buffer and base64 string (SQLite might return either)
  const buffer = Buffer.isBuffer(compressed) 
    ? compressed 
    : Buffer.from(compressed, 'base64');
  
  return gunzipSync(buffer).toString('utf-8');
}

/**
 * Helper function to decompress bz2/gz files
 */
async function decompressFile(filePath, fileName) {
  const lowerFileName = getNormalizedLowerFileName(fileName);
  
  if (lowerFileName.endsWith('.bz2')) {
    // Stream decompressed content to stdout so we don't write temp files
    // (important for read-only mounted result directories)
    // Use spawn instead of execFileSync to avoid maxBuffer limits (ENOBUFS).
    const { spawn } = await import('child_process');
    const child = spawn('bzip2', ['-d', '-k', '-c', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    return await new Promise((resolve, reject) => {
      const outChunks = [];
      const errChunks = [];

      child.stdout.on('data', (chunk) => outChunks.push(chunk));
      child.stderr.on('data', (chunk) => errChunks.push(chunk));
      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(outChunks).toString('utf-8'));
          return;
        }

        const stderr = Buffer.concat(errChunks).toString('utf-8').trim();
        reject(new Error(stderr || `bzip2 exited with code ${code}`));
      });
    });
  } else if (lowerFileName.endsWith('.gz')) {
    const fileContent = await readFile(filePath);
    return new Promise((resolve, reject) => {
      const chunks = [];
      const gunzip = createGunzip();
      
      gunzip.on('data', (chunk) => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      gunzip.on('error', reject);
      
      gunzip.write(fileContent);
      gunzip.end();
    });
  } else {
    const fileContent = await readFile(filePath);
    // Not compressed, read as-is
    return fileContent.toString('utf-8');
  }
}

/**
 * Upload endpoint - receives test result files from GitHub Actions
 * POST /api/upload
 * 
 * Headers:
 * - x-api-key: API key for authentication
 * - x-repo-full-name: Repository full name (e.g., "owner/repo")
 * - x-commit-sha: Commit SHA (optional)
 * - x-engine-name: Engine name (optional)
 * - x-engine-version: Engine version free text (optional)
 * - x-pr-number: PR number (optional)
 * - x-ref-name: Ref name (e.g., "main", "refs/heads/feature")
 * - x-head-ref: Source branch name for PRs (e.g., "feature-branch")
 * - x-ref-kind: "branch" or "tag"
 * - x-workflow-run-id: GitHub workflow run ID
 * - x-artifact-url: URL to workflow artifacts (optional)
 * 
 * Body: multipart/form-data with "file" field containing the test results
 */
fastify.post('/api/upload', {
  preHandler: [requireUploadSurface, authenticateApiKey]
}, async (request, reply) => {
  try {
    // Extract metadata from headers
    let repoFullName = request.headers['x-repo-full-name'];
    let commitSha = request.headers['x-commit-sha'] || null;
    const rawEngineName = request.headers['x-engine-name'];
    const rawEngineVersion = request.headers['x-engine-version'];
    let engineName = rawEngineName ? sanitizeEngineName(rawEngineName) : null;
    let engineVersion = rawEngineVersion ? sanitizeEngineVersion(rawEngineVersion) : null;
    // Optional: human-friendly title for the run (commit message title or PR title)
    let runTitle = request.headers['x-run-title'] || null;
    let prNumber = request.headers['x-pr-number'] ? parseInt(request.headers['x-pr-number'], 10) : null;
    let refName = request.headers['x-ref-name'];
    let headRef = request.headers['x-head-ref'] || null;
    let refKind = request.headers['x-ref-kind'] || 'branch';
    let workflowRunId = request.headers['x-workflow-run-id'] ? parseInt(request.headers['x-workflow-run-id'], 10) : null;
    let artifactUrl = request.headers['x-artifact-url'] || null;
    const uploadSource = normalizeUploadSource(request.headers['x-upload-source']);

    if (request.headers['x-upload-source'] && !uploadSource) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid x-upload-source header. Allowed values: ci, manual'
      });
    }

    if (uploadSource === 'ci' && !workflowRunId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'x-workflow-run-id is required when x-upload-source=ci'
      });
    }

    // Validate required fields (public mode)
    if (!config.isPrivateMode && !repoFullName) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Missing required header: x-repo-full-name is required'
      });
    }

    // Get the uploaded file
    const data = await request.file();
    
    if (!data) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No file uploaded'
      });
    }

    const fileName = data.filename;

    if (config.isPrivateMode) {
      const sourceFolderName = getSourceFolderName(config.localResultsDir);
      const privateMetadata = getPrivateRunMetadata({ fileName, sourceFolderName });
      repoFullName = privateMetadata.repoFullName;
      commitSha = privateMetadata.commitSha;
      engineName = privateMetadata.engineName;
      engineVersion = privateMetadata.engineVersion;
      runTitle = privateMetadata.runTitle;
      prNumber = privateMetadata.prNumber;
      refName = privateMetadata.refName;
      headRef = privateMetadata.headRef;
      refKind = privateMetadata.refKind;
      workflowRunId = privateMetadata.workflowRunId;
      artifactUrl = privateMetadata.artifactUrl;
    }

    if (!config.isPrivateMode && uploadSource === 'manual' && !String(repoFullName || '').toLowerCase().startsWith('manual/')) {
      repoFullName = `manual/${String(repoFullName || 'uploads').replace(/^\/+/, '')}`;
    }

    const effectiveSource = deriveUploadSource({
      uploadSource,
      workflowRunId,
      repoFullName
    });

    if (!config.isPrivateMode && effectiveSource === 'manual') {
      if (!engineName || !engineVersion) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Manual uploads require both x-engine-name and x-engine-version headers'
        });
      }
    }

    runTitle = getUniqueRunTitle(sanitizeRunTitle(runTitle || stripResultExtension(fileName)), repoFullName, commitSha);

    request.log.info(`Receiving upload: ${fileName} from ${repoFullName}@${commitSha || 'no-sha'} (${engineName || 'n/a'} ${engineVersion || 'n/a'}) source=${effectiveSource}`);

    // Create temp directory for processing uploaded files
    const tempDir = join(__dirname, '..', 'uploads', '_temp');
    mkdirSync(tempDir, { recursive: true });

    // Save the uploaded file temporarily for decompression
    const tempFilePath = join(tempDir, `${Date.now()}_temp_${fileName}`);
    await pipeline(data.file, createWriteStream(tempFilePath));

    request.log.info(`File saved temporarily: ${tempFilePath}`);

    // Decompress if needed and parse JSON
    let resultsJson;
    let jsonContent;
    
    try {
      jsonContent = await decompressFile(tempFilePath, fileName);
      resultsJson = JSON.parse(jsonContent);
    } catch (parseError) {
      request.log.error('Failed to parse JSON:', parseError);
      await unlink(tempFilePath);
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid JSON file format'
      });
    }

    // Calculate test statistics
    const stats = calculateTestStats(resultsJson);
    const suiteStats = calculateSuiteStats(resultsJson);
    request.log.info(`Test statistics: ${stats.total} total, ${stats.passed} passed, ${stats.failed} failed`);

    // Compress JSON for efficient DB storage (gzip achieves ~95% compression)
    const compressedData = compressForStorage(jsonContent);
    const originalSize = Buffer.byteLength(jsonContent, 'utf-8');
    const compressedSize = compressedData.length;
    request.log.info(`Compression: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024).toFixed(0)}KB (${((1 - compressedSize / originalSize) * 100).toFixed(1)}% reduction)`);

    // Clean up temp file (no longer saving to filesystem - DB is source of truth)
    await unlink(tempFilePath);

    // Insert into database with compressed JSON
    const stmt = query(
      `INSERT INTO test_suite_runs (
        repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
        workflow_run_id, total, passed, failed, intended, skipped,
        suite_stats, artifact_url, results_json, compression_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const result = stmt.run(
      repoFullName,
      runTitle,
      commitSha,
      engineName,
      engineVersion,
      prNumber,
      refName,
      headRef,
      refKind,
      workflowRunId,
      stats.total,
      stats.passed,
      stats.failed,
      stats.intended,
      stats.skipped,
      JSON.stringify(suiteStats),
      artifactUrl,
      compressedData,  // Store compressed data as BLOB
      'gzip'           // Track compression type for future flexibility
    );

    const insertedId = result.lastInsertRowid;
    request.log.info(`Database entry created with ID: ${insertedId}`);

    // Trigger GitHub App integration (async, non-blocking)
    if (isGitHubAppEnabled() && commitSha) {
      // Fire and forget - don't block the response
      (async () => {
        try {
          // Get previous/master results for comparison
          let previousResults = null;
          let previousRunId = null;

          // Find the latest master/main run for this repo
          const masterStmt = query(
            `SELECT id, commit_sha, results_json, compression_type FROM test_suite_runs
             WHERE repo_full_name = ? 
               AND (ref_name = 'main' OR ref_name = 'master' OR ref_name = 'refs/heads/main' OR ref_name = 'refs/heads/master')
               AND pr_number IS NULL
               AND workflow_run_id IS NOT NULL
               AND commit_sha != ?
             ORDER BY created_at DESC 
             LIMIT 1`
          );
          const masterRun = masterStmt.get(repoFullName, commitSha);

          if (masterRun) {
            previousRunId = masterRun.id;
            try {
              // Decompress if needed, then parse
              let jsonString;
              if (masterRun.compression_type === 'gzip') {
                jsonString = decompressFromStorage(masterRun.results_json);
              } else {
                // Legacy uncompressed data
                jsonString = masterRun.results_json;
              }
              previousResults = JSON.parse(jsonString);
            } catch {
              request.log.warn('Failed to parse master results JSON for comparison');
            }
          }

          // Process with GitHub App
          const githubResult = await processTestRun({
            repoFullName,
            commitSha,
            currentRunId: insertedId,
            prNumber,
            currentResults: resultsJson,
            previousResults,
            previousRunId,
            log: (msg) => request.log.info(msg)
          });

          request.log.info(`GitHub App processing complete: ${githubResult.conclusion}`);

          // If this is a push to main/master (not a PR), this becomes the new baseline
          // The database entry is already created, so no additional action needed
        } catch (githubError) {
          request.log.error('GitHub App processing error:', githubError);
        }
      })();
    } else if (isGitHubAppEnabled() && !commitSha) {
      request.log.info('GitHub App is configured but commit SHA is missing, skipping PR comments and check runs');
    } else {
      request.log.info('GitHub App not configured, skipping PR comments and check runs');
    }

    return {
      success: true,
      message: 'Test results uploaded successfully',
      data: {
        id: insertedId,
        repo_full_name: repoFullName,
        run_title: runTitle,
        commit_sha: commitSha,
        engine_name: engineName,
        engine_version: engineVersion,
        upload_source: effectiveSource,
        pr_number: prNumber,
        storage: {
          original_size_kb: Math.round(originalSize / 1024),
          compressed_size_kb: Math.round(compressedSize / 1024),
          compression_ratio: ((1 - compressedSize / originalSize) * 100).toFixed(1) + '%'
        },
        statistics: stats,
        github_app_enabled: isGitHubAppEnabled()
      }
    };

  } catch (error) {
    request.log.error('Upload error:', error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to process upload'
    });
  }
});

/**
 * Health check endpoint
 */
fastify.get('/health', async () => {
  const ghStatus = getGitHubAppStatus();

  let githubApp;
  if (!isGitHubAppEnabled()) {
    githubApp = 'not_configured';
  } else if (!ghStatus.checked) {
    githubApp = 'configured_not_verified';
  } else if (ghStatus.working) {
    githubApp = 'working';
  } else {
    githubApp = 'error';
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: config.appMode,
    api_surface: config.apiSurface,
    github_app: githubApp,
    ...(ghStatus.appName && { github_app_name: ghStatus.appName }),
    ...(ghStatus.error && { github_app_error: ghStatus.error }),
  };
});

/**
 * GitHub App status endpoint - verifies authentication
 * GET /api/github/status
 */
fastify.get('/api/github/status', {
  preHandler: requireReadSurface
}, async () => {
  if (!isGitHubAppEnabled()) {
    return {
      configured: false,
      authenticated: false,
      message: 'GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_INSTALLATION_ID environment variables.'
    };
  }

  try {
    const authenticated = await verifyAuthentication();
    return {
      configured: true,
      authenticated,
      message: authenticated ? 'GitHub App is authenticated and ready' : 'GitHub App authentication failed'
    };
  } catch (error) {
    return {
      configured: true,
      authenticated: false,
      message: `GitHub App authentication error: ${error.message}`
    };
  }
});

/**
 * Search endpoint - searches by PR number, commit SHA (partial), ref name,
 * run title, engine name, or engine version.
 * GET /api/search?q={query}
 * 
 * Query parameter:
 * - q: Search string (can be PR number, commit SHA, ref name, run title, engine name, or engine version)
 * 
 * Examples:
 * - /api/search?q=1234 (searches PR number)
 * - /api/search?q=abc123 (searches commit SHA)
 * - /api/search?q=main (searches ref name)
 */
fastify.get('/api/search', {
  preHandler: requireReadSurface
}, async (request, reply) => {
  const { q, source } = request.query;

  if (!q || typeof q !== 'string' || q.trim() === '') {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Query parameter "q" is required and must be a non-empty string'
    });
  }

  const searchTerm = q.trim();
  const normalizedSource = normalizeUploadSource(source) || (source === 'unknown' ? 'unknown' : null);

  if (source && !normalizedSource) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid source filter. Allowed values: ci, manual, unknown'
    });
  }

  try {
    // Check if the search term is a number (for PR search)
    const isNumber = /^\d+$/.test(searchTerm);

    let results;

    if (isNumber) {
      // Search by PR number (exact match)
      const prNumber = parseInt(searchTerm, 10);
      let sql = `SELECT
        id, repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
        workflow_run_id, total, passed, failed, intended, skipped,
        suite_stats, artifact_url, created_at
       FROM test_suite_runs
       WHERE pr_number = ?`;
      const params = [prNumber];

      if (normalizedSource) {
        const sourceFilter = getSourceWhereClause(normalizedSource);
        if (sourceFilter.clause) {
          sql += ` AND (${sourceFilter.clause})`;
          params.push(...sourceFilter.params);
        }
      }

      sql += ' ORDER BY created_at DESC';
      const stmt = query(sql);
      results = stmt.all(...params);
    } else {
      // Search by commit SHA (partial match) or ref name (partial match)
      // Use LIKE for case-insensitive partial matching
      const likePattern = `%${searchTerm}%`;
      let sql = `SELECT
          id, repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
          workflow_run_id, total, passed, failed, intended, skipped,
          suite_stats, artifact_url, created_at
         FROM test_suite_runs
        WHERE (commit_sha LIKE ? OR ref_name LIKE ? OR head_ref LIKE ? OR run_title LIKE ? OR engine_name LIKE ? OR engine_version LIKE ?)
      `;
      const params = [likePattern, likePattern, likePattern, likePattern, likePattern, likePattern];

      if (normalizedSource) {
        const sourceFilter = getSourceWhereClause(normalizedSource);
        if (sourceFilter.clause) {
          sql += ` AND (${sourceFilter.clause})`;
          params.push(...sourceFilter.params);
        }
      }

      sql += ' ORDER BY created_at DESC';
      const stmt = query(sql);
      results = stmt.all(...params);
    }

    for (const row of results) {
      row.suite_stats = row.suite_stats ? JSON.parse(row.suite_stats) : [];
    }

    return {
      query: searchTerm,
      count: results.length,
      results: results
    };

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to execute search query'
    });
  }
});

/**
 * Get a specific test suite run by ID
 * GET /api/runs/:id
 */
fastify.get('/api/runs/:id', {
  preHandler: requireReadSurface
}, async (request, reply) => {
  const { id } = request.params;

  if (!id || !/^\d+$/.test(id)) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid ID parameter'
    });
  }

  try {
    const stmt = query(
      `SELECT 
        id, repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
        workflow_run_id, total, passed, failed, intended, skipped,
        artifact_url, results_json, compression_type, created_at
       FROM test_suite_runs
       WHERE id = ?`
    );
    const results = stmt.all(parseInt(id, 10));

    if (results.length === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Test suite run with ID ${id} not found`
      });
    }

    const run = results[0];

    // Decompress and parse the JSON results if present
    if (run.results_json) {
      try {
        let jsonString;
        if (run.compression_type === 'gzip') {
          // Decompress gzip data
          jsonString = decompressFromStorage(run.results_json);
        } else {
          // Legacy uncompressed data (string)
          jsonString = run.results_json;
        }
        run.results_json = JSON.parse(jsonString);
      } catch (e) {
        request.log.warn(`Failed to parse results_json for run ${id}: ${e.message}`);
      }
    }
    
    // Remove compression_type from response (internal detail)
    delete run.compression_type;

    return run;

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to retrieve test suite run'
    });
  }
});

/**
 * Delete a specific test suite run by ID
 * DELETE /api/runs/:id
 * Header: x-api-key (DELETE_API_KEY, or API_KEY if the former is unset)
 */
fastify.delete('/api/runs/:id', {
  preHandler: [requireUploadSurface, authenticateDeleteKey]
}, async (request, reply) => {
  const { id } = request.params;

  if (!id || !/^\d+$/.test(id)) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid ID parameter'
    });
  }

  try {
    const info = query('DELETE FROM test_suite_runs WHERE id = ?').run(parseInt(id, 10));

    if (info.changes === 0) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Test suite run with ID ${id} not found`
      });
    }

    request.log.info(`Deleted test suite run ID: ${id}`);
    return { success: true, message: 'Test suite run deleted', id: parseInt(id, 10) };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to delete test suite run'
    });
  }
});

/**
 * List all test suite runs with optional filters
 * GET /api/runs?repo=&engine=&version=&source=&limit=&offset=
 */
fastify.get('/api/runs', {
  preHandler: requireReadSurface
}, async (request, reply) => {
  const { repo, engine, version, source, limit = 50, offset = 0 } = request.query;

  const limitNum = Math.min(parseInt(limit, 10) || 50, 100); // Max 100
  const offsetNum = parseInt(offset, 10) || 0;
  const normalizedSource = normalizeUploadSource(source) || (source === 'unknown' ? 'unknown' : null);

  if (source && !normalizedSource) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid source filter. Allowed values: ci, manual, unknown'
    });
  }

  try {
    let sql = `SELECT
      id, repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
      workflow_run_id, total, passed, failed, intended, skipped,
      suite_stats, artifact_url, created_at
     FROM test_suite_runs`;

    const params = [];
    const whereParts = [];

    if (repo && typeof repo === 'string' && repo.trim() !== '') {
      whereParts.push('repo_full_name = ?');
      params.push(repo.trim());
    }

    if (engine && typeof engine === 'string' && engine.trim() !== '') {
      whereParts.push('engine_name = ?');
      params.push(engine.trim());
    }

    if (version && typeof version === 'string' && version.trim() !== '') {
      whereParts.push('engine_version = ?');
      params.push(version.trim());
    }

    if (normalizedSource) {
      const sourceFilter = getSourceWhereClause(normalizedSource);
      if (sourceFilter.clause) {
        whereParts.push(sourceFilter.clause);
        params.push(...sourceFilter.params);
      }
    }

    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const stmt = query(sql);
    const results = stmt.all(...params);

    for (const row of results) {
      row.suite_stats = row.suite_stats ? JSON.parse(row.suite_stats) : [];
    }

    return {
      count: results.length,
      limit: limitNum,
      offset: offsetNum,
      results: results
    };

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to retrieve test suite runs'
    });
  }
});

/**
 * GET /api/latest-master
 * 
 * Query params:
 * - repo: Repository full name (e.g., "owner/repo") - required
 * 
 * Returns the latest commit to master/main from the database
 * and compares it with the latest commit from GitHub
 */
fastify.get('/api/latest-master', {
  preHandler: requireReadSurface
}, async (request, reply) => {
  const { repo } = request.query;

  if (!repo || typeof repo !== 'string' || repo.trim() === '') {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Missing required query parameter: repo'
    });
  }

  try {
    // Get latest commit to master/main from database
    const sql = `SELECT 
      id, repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, head_ref, ref_kind,
      workflow_run_id, total, passed, failed, intended, skipped,
      artifact_url, created_at
     FROM test_suite_runs
     WHERE repo_full_name = ? 
       AND (ref_name = 'main' OR ref_name = 'master' OR ref_name = 'refs/heads/main' OR ref_name = 'refs/heads/master')
       AND pr_number IS NULL
       AND workflow_run_id IS NOT NULL
     ORDER BY created_at DESC 
     LIMIT 1`;

    const stmt = query(sql);
    const dbRun = stmt.get(repo.trim());

    if (!dbRun) {
      return {
        dbRun: null,
        githubCommit: null,
        isUpToDate: null,
        message: 'No master/main runs found in database for this repository'
      };
    }

    if (config.isPrivateMode) {
      return {
        dbRun,
        githubCommit: null,
        isUpToDate: true,
        message: 'Private mode: GitHub comparison is disabled'
      };
    }

    // Fetch latest commit from GitHub API
    let githubCommit = null;
    let isUpToDate = null;

    try {
      const [owner, repoName] = repo.split('/');
      
      // Try main branch first
      let response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/commits/main`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'conformance-website-react'
        }
      });

      // If main doesn't exist, try master
      if (response.status === 404) {
        response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/commits/master`, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'conformance-website-react'
          }
        });
      }

      if (response.ok) {
        const data = await response.json();
        githubCommit = {
          sha: data.sha,
          message: data.commit.message,
          author: data.commit.author.name,
          date: data.commit.author.date,
          url: data.html_url
        };

        // Compare commits
        isUpToDate = dbRun.commit_sha === githubCommit.sha;
      } else {
        request.log.warn(`GitHub API returned ${response.status} for ${repo}`);
      }
    } catch (githubError) {
      request.log.error('Error fetching from GitHub API:', githubError);
      // Continue without GitHub data
    }

    return {
      dbRun,
      githubCommit,
      isUpToDate,
      message: isUpToDate === true ? 'Database is up to date' : isUpToDate === false ? 'Database is behind GitHub' : 'Could not verify status'
    };

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to check latest master commit'
    });
  }
});

/**
 * Graceful shutdown handler
 */
const closeGracefully = async (signal) => {
  fastify.log.info(`Received signal to terminate: ${signal}`);
  
  await fastify.close();
  closeDatabase();
  
  process.exit(0);
};

process.on('SIGINT', closeGracefully);
process.on('SIGTERM', closeGracefully);

/**
 * Start the server
 */
const start = async () => {
  try {
    if (config.isPrivateMode && config.privateAutoImport) {
      await importLocalResultsDirectory(config.localResultsDir);
    }

    if (isGitHubAppEnabled()) {
      await verifyAndCacheAuth((msg) => fastify.log.info(msg));
    }

    await fastify.listen({ port: config.port, host: config.host });
    
    fastify.log.info(`Server running at http://${config.host}:${config.port}`);
    fastify.log.info(`Mode: ${config.appMode}`);
    fastify.log.info(`API surface: ${config.apiSurface}`);
    fastify.log.info(`API endpoints:`);
    fastify.log.info(`  - GET  /health`);
    if (config.apiSurface === 'all' || config.apiSurface === 'read') {
      fastify.log.info(`  - GET  /api/github/status`);
      fastify.log.info(`  - GET  /api/search?q={query}`);
      fastify.log.info(`  - GET  /api/runs`);
      fastify.log.info(`  - GET  /api/runs/:id`);
      fastify.log.info(`  - GET  /api/latest-master?repo={owner/repo}`);
    }
    if (config.apiSurface === 'all' || config.apiSurface === 'upload') {
      fastify.log.info(`  - POST /api/upload`);
      fastify.log.info(`  - DELETE /api/runs/:id`);
    }
    
    // Log GitHub App status
    if (isGitHubAppEnabled()) {
      fastify.log.info(`GitHub App: Configured (App ID: ${config.githubAppId})`);
    } else {
      fastify.log.warn(`GitHub App: Not configured - PR comments and check runs disabled`);
    }
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
