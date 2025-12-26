/**
 * Arbitrage detection types
 */

import type { MarketData } from '../market/types.js'

export interface ArbitrageOpportunity {
  marketId: string
  conditionId: string
  yesAsk: number
  noAsk: number
  totalCost: number
  profitMargin: number // 1 - totalCost (before fees)
  profitAfterFees: number // profitMargin - fees
  marketData: MarketData
  timestamp: number
}

export interface ArbitrageConfig {
  minProfitThreshold: number // Minimum profit percentage to execute (e.g., 0.01 = 1%)
  feeBuffer: number // Trading fees buffer (e.g., 0.02 = 2%)
  safetyMargin: number // Additional safety margin (e.g., 0.005 = 0.5%)
  maxPositionSize: number // Max capital per market
  scanInterval: number // How often to scan (ms)
  enabled: boolean // Whether arbitrage detection is running
}

export interface ExecutionPlan {
  marketId: string
  conditionId: string
  yesSize: number // USD to spend on YES
  noSize: number // USD to spend on NO
  yesPrice: number // Expected YES fill price
  noPrice: number // Expected NO fill price
  totalCost: number
  expectedProfit: number
  timestamp: number
}

