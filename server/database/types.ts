/**
 * Database-specific types for SQLite storage
 */

// Account state stored in database (single row)
export interface DBAccountState {
  id: number // Always 1
  starting_capital: number
  current_balance: number
  realized_pnl: number
  last_update: number
  created_at: number
  updated_at: number
}

// Detected trade stored in database
export interface DBDetectedTrade {
  id: number
  transaction_hash: string
  tracked_user_address: string
  tracked_user_name: string | null
  market_id: string | null
  condition_id: string
  side: 'BUY' | 'SELL' | null
  outcome: string | null
  size: number
  price: number
  title: string | null
  slug: string | null
  detected_at: number
  executed: number // SQLite stores boolean as 0/1
  executed_at: number | null
  execution_error: string | null
  raw_trade_json: string
  created_at: number
}
