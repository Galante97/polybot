/**
 * Database migration system
 */

import type Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db: Database.Database) => {
      // Table 1: Trade History
      db.exec(`
        CREATE TABLE trades (
          trade_id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          market_id TEXT NOT NULL,
          condition_id TEXT NOT NULL,
          side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
          action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL')),
          size REAL NOT NULL,
          price REAL NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'filled', 'partial', 'rejected', 'cancelled')),
          timestamp INTEGER NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('paper', 'real')),
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX idx_trades_market_id ON trades(market_id);
        CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);
        CREATE INDEX idx_trades_status ON trades(status);
        CREATE INDEX idx_trades_mode ON trades(mode);
      `)

      // Table 2: Positions
      db.exec(`
        CREATE TABLE positions (
          position_id TEXT PRIMARY KEY,
          market_id TEXT NOT NULL UNIQUE,
          condition_id TEXT NOT NULL,
          yes_tokens REAL NOT NULL DEFAULT 0,
          no_tokens REAL NOT NULL DEFAULT 0,
          yes_entry_price REAL NOT NULL DEFAULT 0,
          no_entry_price REAL NOT NULL DEFAULT 0,
          yes_current_price REAL,
          no_current_price REAL,
          entry_timestamp INTEGER NOT NULL,
          last_update INTEGER NOT NULL,
          unrealized_pnl REAL NOT NULL DEFAULT 0,
          total_entry_cost REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX idx_positions_market_id ON positions(market_id);
        CREATE INDEX idx_positions_last_update ON positions(last_update DESC);
      `)

      // Table 3: Account State
      db.exec(`
        CREATE TABLE account_state (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          starting_capital REAL NOT NULL,
          current_balance REAL NOT NULL,
          realized_pnl REAL NOT NULL DEFAULT 0,
          last_update INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );
      `)

      // Table 4: Detected Copy Trades
      db.exec(`
        CREATE TABLE detected_trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_hash TEXT NOT NULL UNIQUE,
          tracked_user_address TEXT NOT NULL,
          tracked_user_name TEXT,
          market_id TEXT,
          condition_id TEXT NOT NULL,
          side TEXT CHECK(side IN ('BUY', 'SELL')),
          outcome TEXT,
          size REAL NOT NULL,
          price REAL NOT NULL,
          title TEXT,
          slug TEXT,
          detected_at INTEGER NOT NULL,
          executed INTEGER NOT NULL DEFAULT 0 CHECK(executed IN (0, 1)),
          executed_at INTEGER,
          execution_error TEXT,
          raw_trade_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX idx_detected_trades_transaction_hash ON detected_trades(transaction_hash);
        CREATE INDEX idx_detected_trades_detected_at ON detected_trades(detected_at DESC);
        CREATE INDEX idx_detected_trades_executed ON detected_trades(executed);
        CREATE INDEX idx_detected_trades_user ON detected_trades(tracked_user_address);
      `)

      // Table 5: Schema Version (created by migration system if not exists)
      // No need to create here as runMigrations() creates it
    },
  },
  // Future migrations go here
]

export function runMigrations(db: Database.Database): void {
  // Create schema_version table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)

  // Get current version
  const currentVersionRow = db
    .prepare('SELECT MAX(version) as version FROM schema_version')
    .get() as { version: number | null }
  const currentVersion = currentVersionRow?.version || 0

  logger.info('Current schema version', { currentVersion })

  // Apply pending migrations
  const pendingMigrations = migrations.filter((m) => m.version > currentVersion)

  if (pendingMigrations.length === 0) {
    logger.info('Database schema is up to date')
    return
  }

  for (const migration of pendingMigrations) {
    logger.info('Applying migration', { version: migration.version, name: migration.name })

    try {
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
      })()

      logger.info('Migration applied successfully', { version: migration.version })
    } catch (error) {
      logger.error('Migration failed', {
        version: migration.version,
        name: migration.name,
        error,
      })
      throw error
    }
  }
}
