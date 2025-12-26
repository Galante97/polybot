/**
 * Database client for SQLite connection management
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'
import { getConfig } from '../config/env.js'
import { runMigrations } from './migrations.js'

let db: Database.Database | null = null

export function initializeDatabase(): Database.Database {
  if (db) {
    return db
  }

  const config = getConfig()
  const dbPath = config.dbPath

  // Create data directory if it doesn't exist
  const dataDir = path.dirname(dbPath)
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
    logger.info('Created data directory', { dataDir })
  }

  // Initialize database connection
  db = new Database(dbPath, {
    verbose: config.nodeEnv === 'development' ? undefined : undefined, // Can enable for debugging
  })

  // Enable foreign keys and WAL mode for better performance
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000') // 5 second timeout for locks

  logger.info('Database connection established', { dbPath })

  // Run migrations
  runMigrations(db)

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    logger.info('Database connection closed')
  }
}

// Transaction helper
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDatabase()
  const txn = database.transaction(fn)
  return txn(database)
}
