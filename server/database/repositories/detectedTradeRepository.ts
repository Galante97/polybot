/**
 * Detected trade repository for copy trading activity operations
 */

import type Database from 'better-sqlite3'
import type { DetectedTrade, PolymarketTrade } from '../../copytrading/types.js'
import type { DBDetectedTrade } from '../types.js'

export function insertDetectedTrade(db: Database.Database, detectedTrade: DetectedTrade): number {
  const stmt = db.prepare(`
    INSERT INTO detected_trades (
      transaction_hash, tracked_user_address, tracked_user_name, market_id, condition_id,
      side, outcome, size, price, title, slug, detected_at, executed, executed_at,
      execution_error, raw_trade_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const trade = detectedTrade.trade
  const user = detectedTrade.trackedUser

  const result = stmt.run(
    trade.transactionHash,
    user.address,
    user.name || null,
    trade.conditionId || null, // market_id can be same as condition_id
    trade.conditionId,
    trade.side || null,
    trade.outcome || null,
    trade.size,
    trade.price,
    trade.title || null,
    null, // slug - not available in current types
    detectedTrade.detectedAt,
    detectedTrade.executed ? 1 : 0,
    detectedTrade.executedAt || null,
    detectedTrade.executionError || null,
    JSON.stringify(trade)
  )

  return result.lastInsertRowid as number
}

export function markTradeExecuted(
  db: Database.Database,
  transactionHash: string,
  executedAt: number
): void {
  const stmt = db.prepare(`
    UPDATE detected_trades
    SET executed = 1, executed_at = ?
    WHERE transaction_hash = ?
  `)

  stmt.run(executedAt, transactionHash)
}

export function markTradeError(
  db: Database.Database,
  transactionHash: string,
  error: string
): void {
  const stmt = db.prepare(`
    UPDATE detected_trades
    SET execution_error = ?
    WHERE transaction_hash = ?
  `)

  stmt.run(error, transactionHash)
}

export function getDetectedTrades(db: Database.Database, limit: number = 100): DetectedTrade[] {
  const stmt = db.prepare(`
    SELECT * FROM detected_trades
    ORDER BY detected_at DESC
    LIMIT ?
  `)

  const rows = stmt.all(limit) as DBDetectedTrade[]

  return rows.map((row) => {
    const trade: PolymarketTrade = JSON.parse(row.raw_trade_json)

    return {
      trade,
      trackedUser: {
        address: row.tracked_user_address,
        name: row.tracked_user_name || undefined,
      },
      detectedAt: row.detected_at,
      executed: row.executed === 1,
      executedAt: row.executed_at || undefined,
      executionError: row.execution_error || undefined,
    }
  })
}

export function getAllSeenTransactionHashes(db: Database.Database): string[] {
  const stmt = db.prepare('SELECT transaction_hash FROM detected_trades')
  const rows = stmt.all() as Array<{ transaction_hash: string }>

  return rows.map((row) => row.transaction_hash)
}

export function isTransactionSeen(db: Database.Database, transactionHash: string): boolean {
  const stmt = db.prepare('SELECT 1 FROM detected_trades WHERE transaction_hash = ? LIMIT 1')
  const result = stmt.get(transactionHash)

  return result !== undefined
}
