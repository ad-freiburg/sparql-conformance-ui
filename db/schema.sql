CREATE TABLE IF NOT EXISTS test_suite_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_full_name TEXT NOT NULL,
    run_title TEXT,
    commit_sha TEXT,
    engine_name TEXT,
    engine_version TEXT,
    pr_number INTEGER,
    ref_name TEXT,
    head_ref TEXT,
    ref_kind TEXT,
    workflow_run_id INTEGER,
    total INTEGER,
    passed INTEGER,
    failed INTEGER,
    intended INTEGER,
    skipped INTEGER,
    artifact_url TEXT,
    suite_stats TEXT,  -- JSON array of { suite, total, passed, failed, intended } per test suite
    results_json BLOB, -- Compressed JSON stored as BLOB (gzip compressed)
    compression_type TEXT DEFAULT 'gzip', -- Compression format: 'gzip' or NULL for legacy uncompressed
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_repo ON test_suite_runs(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_commit ON test_suite_runs(commit_sha);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_engine_name ON test_suite_runs(engine_name);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_engine_version ON test_suite_runs(engine_version);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_engine_created ON test_suite_runs(engine_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_pr ON test_suite_runs(pr_number) WHERE pr_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_created ON test_suite_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_workflow ON test_suite_runs(workflow_run_id) WHERE workflow_run_id IS NOT NULL;

-- Create a composite index for PR + commit queries
CREATE INDEX IF NOT EXISTS idx_test_suite_runs_pr_commit ON test_suite_runs(pr_number, commit_sha) WHERE pr_number IS NOT NULL;

-- Create FTS5 virtual table for full-text search on repo, run, engine, and ref fields
CREATE VIRTUAL TABLE IF NOT EXISTS test_suite_runs_fts USING fts5(
    repo_full_name,
    run_title,
    engine_name,
    engine_version,
    ref_name,
    head_ref,
    commit_sha,
    content='test_suite_runs',
    content_rowid='id'
);

-- Triggers to keep FTS5 table in sync
CREATE TRIGGER IF NOT EXISTS test_suite_runs_ai AFTER INSERT ON test_suite_runs BEGIN
    INSERT INTO test_suite_runs_fts(rowid, repo_full_name, run_title, engine_name, engine_version, ref_name, head_ref, commit_sha)
    VALUES (new.id, new.repo_full_name, new.run_title, new.engine_name, new.engine_version, new.ref_name, new.head_ref, new.commit_sha);
END;

CREATE TRIGGER IF NOT EXISTS test_suite_runs_ad AFTER DELETE ON test_suite_runs BEGIN
    INSERT INTO test_suite_runs_fts(test_suite_runs_fts, rowid, repo_full_name, run_title, engine_name, engine_version, ref_name, head_ref, commit_sha)
    VALUES('delete', old.id, old.repo_full_name, old.run_title, old.engine_name, old.engine_version, old.ref_name, old.head_ref, old.commit_sha);
END;

CREATE TRIGGER IF NOT EXISTS test_suite_runs_au AFTER UPDATE ON test_suite_runs BEGIN
    INSERT INTO test_suite_runs_fts(test_suite_runs_fts, rowid, repo_full_name, run_title, engine_name, engine_version, ref_name, head_ref, commit_sha)
    VALUES('delete', old.id, old.repo_full_name, old.run_title, old.engine_name, old.engine_version, old.ref_name, old.head_ref, old.commit_sha);
    INSERT INTO test_suite_runs_fts(rowid, repo_full_name, run_title, engine_name, engine_version, ref_name, head_ref, commit_sha)
    VALUES (new.id, new.repo_full_name, new.run_title, new.engine_name, new.engine_version, new.ref_name, new.head_ref, new.commit_sha);
END;
