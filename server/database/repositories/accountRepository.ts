/**
 * Account repository for balance and PnL state operations
 */

import type Database from 'better-sqlite3'
import type { DBAccountState } from '../types.js'

export interface AccountState {
  starting_capital: number
  current_balance: number
  realized_pnl: number
  last_update: number
}

export function getAccountState(db: Database.Database): AccountState | null {
  const stmt = db.prepare('SELECT * FROM account_state WHERE id = 1')
  const row = stmt.get() as DBAccountState | undefined

  if (!row) {
    return null
  }

  return {
    starting_capital: row.starting_capital,
    current_balance: row.current_balance,
    realized_pnl: row.realized_pnl,
    last_update: row.last_update,
  }
}

export function initializeAccountState(db: Database.Database, startingCapital: number): void {
  const stmt = db.prepare(`
    INSERT INTO account_state (id, starting_capital, current_balance, realized_pnl, last_update)
    VALUES (1, ?, ?, 0, ?)
  `)

  const now = Date.now()
  stmt.run(startingCapital, startingCapital, now)
}

export function updateAccountState(
  db: Database.Database,
  balance: number,
  realizedPnL: number
): void {
  const stmt = db.prepare(`
    UPDATE account_state
    SET current_balance = ?, realized_pnl = ?, last_update = ?, updated_at = ?
    WHERE id = 1
  `)

  const now = Date.now()
  stmt.run(balance, realizedPnL, now, now)
}

export function updateBalance(db: Database.Database, balance: number): void {
  const stmt = db.prepare(`
    UPDATE account_state
    SET current_balance = ?, last_update = ?, updated_at = ?
    WHERE id = 1
  `)

  const now = Date.now()
  stmt.run(balance, now, now)
}
