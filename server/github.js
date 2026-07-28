/**
 * GitHub App Service
 *
 * Handles GitHub App authentication, PR comments, and Check Runs.
 */

import config from './config.js';

let octokitInstance = null;

// Cached result of the startup auth check, surfaced in /health
const githubAppStatus = {
  checked: false,
  working: false,
  appName: null,
  error: null,
  checkedAt: null,
};

export function getGitHubAppStatus() {
  return { ...githubAppStatus };
}

function logPrivateKeyDiagnostics(key) {
  const newlineCount = (key.match(/\n/g) || []).length;
  const hasLiteralBackslashN = key.includes('\\n');
  const isRsa = key.includes('BEGIN RSA PRIVATE KEY');
  const isPkcs8 = key.includes('BEGIN PRIVATE KEY');

  console.error('[GitHub App] Private key diagnostics:');
  console.error(`  Format : ${isRsa ? 'PKCS#1 (RSA)' : isPkcs8 ? 'PKCS#8' : 'unknown'}`);
  console.error(`  Actual newlines : ${newlineCount}`);
  console.error(`  Literal \\n present : ${hasLiteralBackslashN}`);

  if (newlineCount < 2 && !hasLiteralBackslashN) {
    console.error('[GitHub App] Key is missing line breaks — PEM requires ~64-char lines.');
    console.error('[GitHub App] Fix: in your .env file store the key with \\n between lines, e.g.:');
    console.error('[GitHub App]   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----"');
  }
}

/**
 * Get or create an authenticated Octokit instance
 * Uses lazy initialization to avoid loading dependencies if not needed
 *
 * @returns {Promise<import('@octokit/rest').Octokit>}
 */
async function getOctokit() {
  if (octokitInstance) {
    return octokitInstance;
  }

  if (!config.isGitHubAppConfigured) {
    throw new Error('GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_INSTALLATION_ID environment variables.');
  }

  const { Octokit } = await import('@octokit/rest');
  const { createAppAuth } = await import('@octokit/auth-app');

  octokitInstance = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
      installationId: config.githubInstallationId,
    },
  });

  return octokitInstance;
}

/**
 * Verify GitHub App authentication against the real GitHub API and cache the result.
 * Called once at startup so /health can report the actual working state.
 */
export async function verifyAndCacheAuth(log = console.log) {
  if (!config.isGitHubAppConfigured) return;

  try {
    const octokit = await getOctokit();
    const { data } = await octokit.rest.apps.getAuthenticated();

    githubAppStatus.checked = true;
    githubAppStatus.working = true;
    githubAppStatus.appName = data.name;
    githubAppStatus.error = null;
    githubAppStatus.checkedAt = new Date().toISOString();

    log(`[GitHub App] Authenticated as "${data.name}" (id: ${data.id})`);
  } catch (error) {
    // Reset the cached instance so the next attempt rebuilds it
    octokitInstance = null;

    githubAppStatus.checked = true;
    githubAppStatus.working = false;
    githubAppStatus.appName = null;
    githubAppStatus.error = error.message;
    githubAppStatus.checkedAt = new Date().toISOString();

    if (error.message.includes('DECODER') || error.message.includes('unsupported')) {
      console.error('[GitHub App] Authentication failed — private key cannot be decoded by OpenSSL.');
      logPrivateKeyDiagnostics(config.githubPrivateKey || '');
    } else {
      console.error(`[GitHub App] Authentication failed: ${error.message}`);
    }
  }
}

/**
 * Verify GitHub App authentication
 * @returns {Promise<boolean>} True if authentication is valid
 */
export async function verifyAuthentication() {
  try {
    const octokit = await getOctokit();
    await octokit.rest.apps.listReposAccessibleToInstallation({
      installation_id: config.githubInstallationId,
    });
    return true;
  } catch (error) {
    console.error('GitHub App authentication failed:', error.message);
    return false;
  }
}

/**
 * Create or update a Check Run on a commit
 * 
 * @param {Object} options
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {string} options.commitSha - Commit SHA to attach the check to
 * @param {string} options.conclusion - 'success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required'
 * @param {string} options.summary - Short summary text
 * @param {string} options.text - Detailed text/body (supports markdown)
 * @param {string} [options.name] - Check name (defaults to config)
 * @param {string} [options.title] - Check title (defaults to config)
 * @returns {Promise<Object>} Created check run
 */
export async function createCheckRun({
  owner,
  repo,
  commitSha,
  conclusion,
  summary,
  text,
  name = config.checkName,
  title = config.checkTitle
}) {
  const octokit = await getOctokit();

  try {
    const checkRun = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: commitSha,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      output: {
        title: config.checkRunningTitle,
        summary: 'The test suite is in progress...',
      },
    });

    const updated = await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRun.data.id,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title,
        summary,
        text
      }
    });

    return updated.data;
  } catch (error) {
    console.error(`Error creating check run for ${owner}/${repo}@${commitSha}:`, error.message);
    throw error;
  }
}

/**
 * Post or update a comment on a PR
 * Deletes previous bot comments to avoid spam
 * 
 * @param {Object} options
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.prNumber - PR number
 * @param {string} options.body - Comment body (supports markdown)
 * @param {string} [options.commentAuthor] - Bot username to identify previous comments
 * @returns {Promise<Object>} Created comment
 */
export async function postPRComment({
  owner,
  repo,
  prNumber,
  body,
  commentAuthor = config.commentAuthor
}) {
  const octokit = await getOctokit();

  try {
    const normalizedCommentAuthor = String(commentAuthor || '').trim().toLowerCase();

    let appBotLogin = null;
    try {
      const { data: app } = await octokit.rest.apps.getAuthenticated();
      if (app?.slug) {
        appBotLogin = `${String(app.slug).toLowerCase()}[bot]`;
      }
    } catch (authError) {
      console.warn(`Failed to resolve authenticated app slug: ${authError.message}`);
    }

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100
    });

    const commentsToDelete = comments.filter((comment) => {
      const login = String(comment?.user?.login || '').trim().toLowerCase();
      return !!login && (
        (normalizedCommentAuthor && login === normalizedCommentAuthor) ||
        (appBotLogin && login === appBotLogin)
      );
    });

    for (const previousComment of commentsToDelete) {
      try {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: previousComment.id
        });
        console.log(`Deleted previous comment ${previousComment.id}`);
      } catch (deleteError) {
        console.warn(`Failed to delete previous comment ${previousComment.id}: ${deleteError.message}`);
      }
    }

    const newComment = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    return newComment.data;
  } catch (error) {
    console.error(`Error posting PR comment to ${owner}/${repo}#${prNumber}:`, error.message);
    throw error;
  }
}

/**
 * Get the latest commit SHA from the main/master branch
 * 
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<string|null>} Commit SHA or null if not found
 */
export async function getDefaultBranchCommit(owner, repo) {
  const octokit = await getOctokit();

  try {
    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.default_branch;

    const { data: branch } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch
    });

    return branch.commit.sha;
  } catch (error) {
    console.error(`Error getting default branch commit for ${owner}/${repo}:`, error.message);
    return null;
  }
}

/**
 * Parse repository full name into owner and repo
 * @param {string} repoFullName - Format: "owner/repo"
 * @returns {{ owner: string, repo: string }}
 */
function parseRepoFullName(repoFullName) {
  const [owner, repo] = repoFullName.split('/');
  return { owner, repo };
}

/**
 * Extract tests for a specific suite as a flat { testName: testObj } map.
 * Handles both v1 (flat sparql11 format) and v2 (multi-suite format).
 */
function extractSuiteTests(resultsJson, suite) {
  if (!resultsJson) return {};
  if ('version' in resultsJson) {
    return resultsJson.suites?.[suite]?.tests ?? {};
  }
  const tests = {};
  for (const [k, v] of Object.entries(resultsJson)) {
    if (k !== 'info') tests[k] = v;
  }
  return tests;
}

/**
 * Return the suite keys present in a result file.
 * v2: keys of suites object. v1 legacy: ['sparql11'].
 */
function getSuiteKeys(resultsJson) {
  if (!resultsJson) return [];
  if ('version' in resultsJson) return Object.keys(resultsJson.suites ?? {});
  return ['sparql11'];
}

/**
 * Process a test run and trigger GitHub integrations
 * This is the main entry point after an upload
 * 
 * @param {Object} options
 * @param {string} options.repoFullName - Repository full name (owner/repo)
 * @param {string} options.commitSha - Commit SHA of the upload
 * @param {number|string|null} options.currentRunId - Database ID of the current uploaded run
 * @param {number|null} options.prNumber - PR number (null for push events)
 * @param {Object} options.currentResults - Current test results JSON
 * @param {Object|null} options.previousResults - Previous test results JSON (for comparison)
 * @param {number|string|null} options.previousRunId - Previous baseline run ID (for comparison link)
 * @param {Function} options.log - Logger function
 * @returns {Promise<Object>} Processing result
 */
export async function processTestRun({
  repoFullName,
  commitSha,
  currentRunId,
  prNumber,
  currentResults,
  previousResults,
  previousRunId,
  log = console.log
}) {
  const { compareTestRuns } = await import('./compare.js');
  const { buildCommentBody } = await import('./commentBuilder.js');
  const { calculateSuiteStats } = await import('./testStats.js');

  const { owner, repo } = parseRepoFullName(repoFullName);

  const suiteKeys = getSuiteKeys(currentResults);
  const suiteComparisons = {};
  for (const suiteKey of suiteKeys) {
    const cur = extractSuiteTests(currentResults, suiteKey);
    const prev = extractSuiteTests(previousResults || {}, suiteKey);
    suiteComparisons[suiteKey] = compareTestRuns(cur, prev);
  }
  // Verdict is sparql11-only (intentional — regression check is SPARQL 1.1 conformance)
  const comparison = suiteComparisons['sparql11'] ?? compareTestRuns({}, {});

  const suiteStats = calculateSuiteStats(currentResults);

  const { body: commentBody, summary } = buildCommentBody(
    comparison,
    config.websiteUrl,
    currentRunId,
    previousRunId,
    suiteStats,
    suiteComparisons
  );

  const conclusion = comparison.isMergeable ? 'success' : 'failure';

  let checkRun = null;
  try {
    checkRun = await createCheckRun({
      owner,
      repo,
      commitSha,
      conclusion,
      summary,
      text: commentBody
    });
    log(`Created check run for ${repoFullName}@${commitSha}: ${conclusion}`);
  } catch (error) {
    log(`Failed to create check run: ${error.message}`);
  }

  let prComment = null;
  if (prNumber) {
    try {
      prComment = await postPRComment({
        owner,
        repo,
        prNumber,
        body: commentBody
      });
      log(`Posted PR comment to ${repoFullName}#${prNumber}`);
    } catch (error) {
      log(`Failed to post PR comment: ${error.message}`);
    }
  }

  return {
    comparison,
    conclusion,
    checkRun,
    prComment
  };
}

/**
 * Check if GitHub App features are available
 * @returns {boolean}
 */
export function isGitHubAppEnabled() {
  return config.isGitHubAppConfigured;
}
