/**
 * Abstract execution engine interface
 * Allows swapping between paper and real execution
 */

import {
  TradeOrder,
  FillResult,
  Position,
  PnLSummary,
  TradeRecord,
  ExecutionMode,
} from './types.js'

export interface IExecutionEngine {
  /**
   * Execute a trade order
   */
  executeTrade(order: TradeOrder): Promise<FillResult>

  /**
   * Get all open positions
   */
  getPositions(): Position[]

  /**
   * Get position for a specific market
   */
  getPosition(marketId: string): Position | undefined

  /**
   * Close a position (sell all tokens)
   */
  closePosition(marketId: string): Promise<FillResult[]>

  /**
   * Close all positions
   */
  closeAllPositions(): Promise<FillResult[]>

  /**
   * Redeem a position at settlement value (for resolved markets)
   * @param marketId - Market condition ID
   * @param winningOutcome - 0 for YES won, 1 for NO won
   */
  redeemPosition(marketId: string, winningOutcome: 0 | 1): Promise<void>

  /**
   * Get PnL summary
   */
  getPnL(): PnLSummary

  /**
   * Get current balance
   */
  getBalance(): number

  /**
   * Get trade history
   */
  getTradeHistory(limit?: number): TradeRecord[]

  /**
   * Get execution mode
   */
  getMode(): ExecutionMode
}

