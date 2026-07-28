#!/usr/bin/env node

/**
 * Database setup script
 * Reads schema.sql and executes it to create tables, indexes, and FTS5 virtual tables
 * 
 * Usage:
 *   node db/setup.js
 *   npm run db:setup
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db, { testConnection } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  console.log('Starting database setup...\n');

  // Test connection and extensions first
  const hasExtensions = testConnection();
  if (!hasExtensions) {
    console.error('\n✗ Cannot proceed without FTS5 extension support');
    console.error('Ensure better-sqlite3 is built with FTS5 support');
    process.exit(1);
  }

  try {
    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql');
    console.log(`\nReading schema from: ${schemaPath}`);
    const schema = await readFile(schemaPath, 'utf-8');

    // Execute schema (split by semicolon for multiple statements)
    console.log('\nExecuting schema...');
    db.exec(schema);
    console.log('✓ Schema executed successfully');

    // Verify table exists
    const tables = db.prepare(`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type='table' AND name='test_suite_runs'
    `).all();

    if (tables.length > 0) {
      console.log('\n✓ Table "test_suite_runs" created');
      
      // Get column info
      const columns = db.prepare('PRAGMA table_info(test_suite_runs)').all();
      console.log('\n  Columns:');
      columns.forEach(col => {
        const nullable = col.notnull ? 'NOT NULL' : 'nullable';
        const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
        console.log(`  - ${col.name} (${col.type}) ${nullable}${defaultVal}`);
      });
    }

    // Show indexes
    const indexes = db.prepare(`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type='index' AND tbl_name='test_suite_runs' AND name NOT LIKE 'sqlite_%'
    `).all();

    if (indexes.length > 0) {
      console.log('\n✓ Indexes created:');
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}`);
      });
    }

    // Check FTS5 table
    const ftsTable = db.prepare(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table' AND name='test_suite_runs_fts'
    `).get();

    if (ftsTable) {
      console.log('\n✓ FTS5 virtual table created: test_suite_runs_fts');
    }

    // Check triggers
    const triggers = db.prepare(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='trigger' AND tbl_name='test_suite_runs'
    `).all();

    if (triggers.length > 0) {
      console.log('\n✓ Triggers created:');
      triggers.forEach(t => {
        console.log(`  - ${t.name}`);
      });
    }

    console.log('\n✓ Database setup completed successfully!\n');
    console.log(`Database location: ${process.env.DB_PATH || join(__dirname, '..', 'conformance.db')}\n`);
  } catch (error) {
    console.error('\n✗ Database setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run setup
setupDatabase();
