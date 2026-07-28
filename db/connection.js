import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || join(__dirname, '..', 'conformance.db');

/**
 * Initialize SQLite database with FTS5 extension support
 */
const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

db.pragma('foreign_keys = ON');

db.pragma('busy_timeout = 5000');

db.pragma('journal_mode = WAL');

function checkFTS5() {
  try {
    db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS fts_test USING fts5(content)').run();
    db.prepare('DROP TABLE IF EXISTS fts_test').run();
    return true;
  } catch (error) {
    console.error('❌ FTS5 extension not available:', error.message);
    return false;
  }
}

/**
 * @returns {boolean} True if connection and extensions are working
 */
export function testConnection() {
  try {
    const result = db.prepare("SELECT datetime('now') as now").get();
    console.log('✓ Database connected successfully');
    console.log('  Database path:', dbPath);
    console.log('  Current time:', result.now);
    
    const fts5 = checkFTS5();
    
    console.log('  FTS5 extension:', fts5 ? '✓ Available' : '✗ Not available');
    
    return fts5;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Execute a query with parameters
 * @param {string} sql - SQL query text
 * @param {Array|Object} params - Query parameters
 * @returns {object} Statement object for chaining .run(), .get(), or .all()
 */
export function query(sql) {
  try {
    const stmt = db.prepare(sql);
    return stmt;
  } catch (error) {
    console.error('Query preparation error:', { sql, error: error.message });
    throw error;
  }
}

/**
 * Begin a transaction
 * @returns {Transaction} Transaction object
 */
export function transaction(fn) {
  return db.transaction(fn);
}

/**
 * Close the database connection
 * Call this when shutting down the application
 */
export function closeDatabase() {
  db.close();
  console.log('Database connection closed');
}

/**
 * Get database statistics
 */
export function getStats() {
  const stats = {
    isOpen: db.open,
    inTransaction: db.inTransaction,
    path: dbPath,
  };
  return stats;
}

/**
 * Backup database to a file
 * @param {string} backupPath - Path to backup file
 */
export function backup(backupPath) {
  return db.backup(backupPath);
}

// Export the raw database instance for advanced usage
export default db;
