#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { query, closeDatabase } from './connection.js';
import { calculateTestStats } from '../server/testStats.js';

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Import test results from JSON files into the database

Usage:
  npm run db:import -- <file.json> [options]

Options:
  --repo <owner/repo>     Repository name (default: example/test-repo)
  --commit <sha>          Commit SHA (optional)
  --pr <number>           PR number (optional)
  --ref <name>            Ref name (default: main)
  --ref-kind <kind>       Ref kind: branch or tag (default: branch)
  --workflow <id>         Workflow run ID (optional)
  --engine <name>         Engine name (default: from --repo)
  --engine-version <ver>  Engine version free text (default: from --ref)

Examples:
  npm run db:import -- public/results/test.json
  npm run db:import -- test.json --repo owner/repo --pr 123
  npm run db:import -- test.json --ref feature/test --commit abc123def
    `);
    process.exit(0);
  }

  const config = {
    file: args[0],
    repo: 'example/test-repo',
    commit: null,
    pr: null,
    ref: 'main',
    refKind: 'branch',
    workflow: null,
    title: null,
    engine: null,
    engineVersion: null,
  };

  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--repo':
        config.repo = value;
        break;
      case '--commit':
        config.commit = value;
        break;
      case '--pr':
        config.pr = parseInt(value, 10);
        break;
      case '--ref':
        config.ref = value;
        break;
      case '--ref-kind':
        config.refKind = value;
        break;
      case '--workflow':
        config.workflow = parseInt(value, 10);
        break;
      case '--title':
        config.title = value;
        break;
      case '--engine':
        config.engine = value;
        break;
      case '--engine-version':
        config.engineVersion = value;
        break;
      default:
        console.warn(`Unknown flag: ${flag}`);
    }
  }

  if (!config.engine) {
    config.engine = config.repo;
  }

  if (!config.engineVersion) {
    config.engineVersion = config.ref || 'unknown';
  }

  return config;
}

async function importResults(config) {
  console.log('📊 Importing test results...\n');

  try {
    const filePath = resolve(config.file);
    console.log(`Reading file: ${filePath}`);
    const content = await readFile(filePath, 'utf-8');
    const results = JSON.parse(content);
    console.log('✓ JSON file loaded\n');

    const stats = calculateTestStats(results);
    console.log('Test Statistics:');
    console.log(`  Total:    ${stats.total}`);
    console.log(`  Passed:   ${stats.passed}`);
    console.log(`  Failed:   ${stats.failed}`);
    console.log(`  Intended: ${stats.intended}`);
    console.log(`  Skipped:  ${stats.skipped}\n`);

    const data = {
      repo_full_name: config.repo,
      run_title: config.title,
      commit_sha: config.commit,
      engine_name: config.engine,
      engine_version: config.engineVersion,
      pr_number: config.pr,
      ref_name: config.ref,
      ref_kind: config.refKind,
      workflow_run_id: config.workflow,
      total: stats.total,
      passed: stats.passed,
      failed: stats.failed,
      intended: stats.intended,
      skipped: stats.skipped,
      artifact_url: null,
      results_json: gzipSync(Buffer.from(JSON.stringify(results), 'utf-8')),
      compression_type: 'gzip',
    };

    console.log('Import Configuration:');
    console.log(`  Repository:    ${data.repo_full_name}`);
    console.log(`  Commit SHA:    ${data.commit_sha || 'N/A'}`);
    console.log(`  Engine:        ${data.engine_name}`);
    console.log(`  Version:       ${data.engine_version}`);
    console.log(`  PR Number:     ${data.pr_number || 'N/A'}`);
    console.log(`  Ref:           ${data.ref_name} (${data.ref_kind})`);
    console.log(`  Workflow ID:   ${data.workflow_run_id || 'N/A'}\n`);

    const result = query(`
      INSERT INTO test_suite_runs 
      (repo_full_name, run_title, commit_sha, engine_name, engine_version, pr_number, ref_name, ref_kind, 
       workflow_run_id, total, passed, failed, intended, skipped, 
       artifact_url, results_json, compression_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.repo_full_name,
      data.run_title,
      data.commit_sha,
      data.engine_name,
      data.engine_version,
      data.pr_number,
      data.ref_name,
      data.ref_kind,
      data.workflow_run_id,
      data.total,
      data.passed,
      data.failed,
      data.intended,
      data.skipped,
      data.artifact_url,
      data.results_json,
      data.compression_type
    );

    const insertedId = result.lastInsertRowid;
    console.log(`✅ Successfully imported test results!`);
    console.log(`   Database ID: ${insertedId}\n`);

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

const config = parseArgs();
importResults(config);
