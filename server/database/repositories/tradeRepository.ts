/**
 * Trade repository for trade history operations
 */

import type Database from 'better-sqlite3'
import type { TradeRecord } from '../../trading/types.js'

export function insertTrade(db: Database.Database, trade: TradeRecord): void {
  const stmt = db.prepare(`
    INSERT INTO trades (
      trade_id, order_id, market_id, condition_id, side, action,
      size, price, status, timestamp, mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    trade.tradeId,
    trade.orderId,
    trade.marketId,
    trade.conditionId,
    trade.side,
    trade.action,
    trade.size,
    trade.price,
    trade.status,
    trade.timestamp,
    trade.mode
  )
}

export function getTradeHistory(
  db: Database.Database,
  limit: number = 100,
  offset: number = 0
): TradeRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM trades
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `)

  const rows = stmt.all(limit, offset) as any[]

  return rows.map((row) => ({
    tradeId: row.trade_id,
    orderId: row.order_id,
    marketId: row.market_id,
    conditionId: row.condition_id,
    side: row.side,
    action: row.action,
    size: row.size,
    price: row.price,
    status: row.status,
    timestamp: row.timestamp,
    mode: row.mode,
  }))
}

export function getTradesByMarket(db: Database.Database, marketId: string): TradeRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM trades
    WHERE market_id = ?
    ORDER BY timestamp DESC
  `)

  const rows = stmt.all(marketId) as any[]

  return rows.map((row) => ({
    tradeId: row.trade_id,
    orderId: row.order_id,
    marketId: row.market_id,
    conditionId: row.condition_id,
    side: row.side,
    action: row.action,
    size: row.size,
    price: row.price,
    status: row.status,
    timestamp: row.timestamp,
    mode: row.mode,
  }))
}

export function getTradeCount(db: Database.Database): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM trades')
  const result = stmt.get() as { count: number }
  return result.count
}
