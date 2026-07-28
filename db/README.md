# Database Setup

This directory contains SQLite database setup and connection utilities using better-sqlite3 and FTS5.

> **This is the non-Docker local development path** — running the Node API and SQLite
> scripts directly on your machine (e.g. to hack on the code). For Docker-based hosting
> (`docker-compose.yml` for public mode or `docker-compose.private.yml` for private mode),
> see [../SETUP.md](../SETUP.md) instead; those ports are `8080`/`8081`/`3001`, whereas
> the raw dev API server below runs on `3000`.

## Quick Start

### 1. Run Setup Script

```bash
npm run db:setup
```

This will create `conformance.db` in the project root with all tables, indexes, FTS5 virtual tables and triggers.

### 2. Test Connection

```bash
npm run db:test
```

### 3. Import Test Results

Import existing test result JSON files:

```bash
npm run db:import -- public/results/test.json

# Import with custom metadata
npm run db:import -- test.json --repo owner/repo --pr 123 --commit abc123

# all options
npm run db:import -- test.json \
  --repo SIRDNARch/qlever \
  --pr 1234 \
  --commit abc123def456 \
  --ref feature/improvements \
  --ref-kind branch \
  --workflow 789456
```

### 4. Start the API Server

```bash
# Development mode (auto-reload)
npm run server:dev

# Production mode
npm run server
```

API endpoints will be available at `http://localhost:3000`.

**Import Options:**
- `--repo <owner/repo>` - Repository name (default: example/test-repo)
- `--commit <sha>` - Commit SHA (optional)
- `--pr <number>` - PR number (optional)
- `--ref <name>` - Ref name (default: main)
- `--ref-kind <kind>` - Ref kind: branch or tag (default: branch)
- `--workflow <id>` - Workflow run ID (optional)
- `--title <text>` - Optional run title
- `--engine <name>` - Engine name (default: value from `--repo`)
- `--engine-version <ver>` - Engine version (default: value from `--ref`)

The import command will:
- Calculate test statistics (total, passed, failed, etc.)
- Store the full JSON results in the database
- Display the database ID for querying

## Files

- **`schema.sql`** - Database schema with table, indexes, FTS5 table, and triggers
- **`connection.js`** - SQLite connection and query utilities
- **`setup.js`** - Setup script to create tables and indexes
- **`import.js`** - Import test result JSON files into the database

## Table Schema

### `test_suite_runs`

Stores SPARQL test suite run results from CI uploads, manual uploads, and private/local imports.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (auto-increment) |
| `repo_full_name` | TEXT | Repository name (owner/repo) |
| `run_title` | TEXT | Human-friendly title for the run (PR title or commit message title) |
| `commit_sha` | TEXT | Git commit SHA |
| `engine_name` | TEXT | Engine name |
| `engine_version` | TEXT | Engine version |
| `pr_number` | INTEGER | Pull request number (nullable) |
| `ref_name` | TEXT | Git ref name (branch/tag) |
| `head_ref` | TEXT | PR/source branch ref when available |
| `ref_kind` | TEXT | Type of ref |
| `workflow_run_id` | INTEGER | GitHub Actions run ID |
| `total` | INTEGER | Total tests in run |
| `passed` | INTEGER | Tests passed |
| `failed` | INTEGER | Tests failed |
| `intended` | INTEGER | Tests failed as intended |
| `skipped` | INTEGER | Tests skipped |
| `artifact_url` | TEXT | URL to GitHub artifact |
| `suite_stats` | TEXT | JSON array of per-suite stats `{ suite, total, passed, failed, intended }` |
| `results_json` | BLOB | Full test results, stored gzip-compressed |
| `compression_type` | TEXT | Compression format (`gzip`) |
| `created_at` | TEXT | Creation timestamp (ISO8601) |

### Indexes

- `idx_test_suite_runs_repo` - On `repo_full_name`
- `idx_test_suite_runs_commit` - On `commit_sha`
- `idx_test_suite_runs_engine_name` - On `engine_name`
- `idx_test_suite_runs_engine_version` - On `engine_version`
- `idx_test_suite_runs_engine_created` - On `(engine_name, created_at DESC)`
- `idx_test_suite_runs_pr` - On `pr_number` (partial, WHERE NOT NULL)
- `idx_test_suite_runs_created` - On `created_at DESC`
- `idx_test_suite_runs_workflow` - On `workflow_run_id` (partial, WHERE NOT NULL)
- `idx_test_suite_runs_pr_commit` - On `(pr_number, commit_sha)` (partial)

### FTS5 Virtual Table

`test_suite_runs_fts` - Full-text search index on:
- `repo_full_name`
- `run_title`
- `engine_name`
- `engine_version`
- `ref_name`
- `head_ref`
- `commit_sha`

Automatically kept in sync via triggers.

## Extensions

### FTS5 Extension

Full-text search capabilities:

**Search across indexed columns:**
```javascript
const results = query(`
  SELECT test_suite_runs.*
  FROM test_suite_runs_fts
  JOIN test_suite_runs ON test_suite_runs_fts.rowid = test_suite_runs.id
  WHERE test_suite_runs_fts MATCH ?
`).all('search term');
```

## Usage Examples

### Import the connection

```javascript
import db, { query, transaction, closeDatabase } from './db/connection.js';
```

### Simple query

```javascript
const runs = query(
  'SELECT * FROM test_suite_runs WHERE pr_number = ? ORDER BY created_at DESC LIMIT 10'
).all(123);

console.log(runs);
```

### Insert data

```javascript
const result = query(
  `INSERT INTO test_suite_runs 
   (repo_full_name, commit_sha, pr_number, total, passed, failed) 
   VALUES (?, ?, ?, ?, ?, ?)`
).run('owner/repo', 'abc123', 456, 700, 650, 50);

console.log('Inserted ID:', result.lastInsertRowid);
```

### Transaction

```javascript
const insertMultiple = transaction((runs) => {
  const stmt = query(
    'INSERT INTO test_suite_runs (repo_full_name, commit_sha, total) VALUES (?, ?, ?)'
  );
  
  return runs.map(run => stmt.run(...run));
});

const results = insertMultiple([
  ['owner/repo1', 'abc123', 700],
  ['owner/repo2', 'def456', 650],
]);
```

### Results JSON storage note

results_json is gzip-compressed in storage.
To read it as JSON, use the API (`GET /api/runs/:id`) or
decompress in application code before JSON.parse.

### Environment Variables

- `DB_PATH` - Path to database file (default: `./conformance.db`)
- `NODE_ENV` - Set to `development` for verbose logging

### Connection Settings

The database is configured with:
- **Foreign keys:** Enabled
- **Busy timeout:** 5000ms (handles concurrent access)
- **Journal mode:** WAL (Write-Ahead Logging for better concurrency)
