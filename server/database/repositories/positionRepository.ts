/**
 * Position repository for position management operations
 */

import type Database from 'better-sqlite3'
import type { Position } from '../../trading/types.js'

export function upsertPosition(db: Database.Database, position: Position): void {
  const stmt = db.prepare(`
    INSERT INTO positions (
      position_id, market_id, condition_id, yes_tokens, no_tokens,
      yes_entry_price, no_entry_price, yes_current_price, no_current_price,
      entry_timestamp, last_update, unrealized_pnl, total_entry_cost, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(market_id) DO UPDATE SET
      yes_tokens = excluded.yes_tokens,
      no_tokens = excluded.no_tokens,
      yes_entry_price = excluded.yes_entry_price,
      no_entry_price = excluded.no_entry_price,
      yes_current_price = excluded.yes_current_price,
      no_current_price = excluded.no_current_price,
      last_update = excluded.last_update,
      unrealized_pnl = excluded.unrealized_pnl,
      total_entry_cost = excluded.total_entry_cost,
      updated_at = excluded.updated_at
  `)

  const now = Date.now()

  stmt.run(
    position.positionId,
    position.marketId,
    position.conditionId,
    position.yesTokens,
    position.noTokens,
    position.yesEntryPrice,
    position.noEntryPrice,
    position.yesCurrentPrice,
    position.noCurrentPrice,
    position.entryTimestamp,
    position.lastUpdate,
    position.unrealizedPnL,
    position.totalEntryCost,
    now
  )
}

export function getPosition(db: Database.Database, marketId: string): Position | null {
  const stmt = db.prepare('SELECT * FROM positions WHERE market_id = ?')
  const row = stmt.get(marketId) as any

  if (!row) {
    return null
  }

  return {
    positionId: row.position_id,
    marketId: row.market_id,
    conditionId: row.condition_id,
    yesTokens: row.yes_tokens,
    noTokens: row.no_tokens,
    yesEntryPrice: row.yes_entry_price,
    noEntryPrice: row.no_entry_price,
    yesCurrentPrice: row.yes_current_price,
    noCurrentPrice: row.no_current_price,
    entryTimestamp: row.entry_timestamp,
    lastUpdate: row.last_update,
    unrealizedPnL: row.unrealized_pnl,
    totalEntryCost: row.total_entry_cost,
  }
}

export function getAllPositions(db: Database.Database): Position[] {
  const stmt = db.prepare('SELECT * FROM positions ORDER BY last_update DESC')
  const rows = stmt.all() as any[]

  return rows.map((row) => ({
    positionId: row.position_id,
    marketId: row.market_id,
    conditionId: row.condition_id,
    yesTokens: row.yes_tokens,
    noTokens: row.no_tokens,
    yesEntryPrice: row.yes_entry_price,
    noEntryPrice: row.no_entry_price,
    yesCurrentPrice: row.yes_current_price,
    noCurrentPrice: row.no_current_price,
    entryTimestamp: row.entry_timestamp,
    lastUpdate: row.last_update,
    unrealizedPnL: row.unrealized_pnl,
    totalEntryCost: row.total_entry_cost,
  }))
}

export function deletePosition(db: Database.Database, marketId: string): void {
  const stmt = db.prepare('DELETE FROM positions WHERE market_id = ?')
  stmt.run(marketId)
}
