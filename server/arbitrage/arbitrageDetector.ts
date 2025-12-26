/**
 * Arbitrage Detection Service
 * Scans markets for YES/NO arbitrage opportunities
 */

import { logger } from '../utils/logger.js'
import { getConfig } from '../config/env.js'
import { MarketStore } from '../market/marketStore.js'
import type { MarketData } from '../market/types.js'
import type {
  ArbitrageOpportunity,
  ArbitrageConfig,
  ExecutionPlan,
} from './types.js'

export class ArbitrageDetector {
  private marketStore: MarketStore
  private config: ArbitrageConfig
  private trackedMarkets: Set<string> = new Set() // Markets we've already entered

  constructor(marketStore: MarketStore) {
    this.marketStore = marketStore
    const appConfig = getConfig()

    this.config = {
      minProfitThreshold: appConfig.minProfitThreshold,
      feeBuffer: appConfig.minProfitThreshold * 2, // Default: 2x profit threshold as fee buffer
      safetyMargin: appConfig.minProfitThreshold * 0.5, // Default: 0.5x as safety margin
      maxPositionSize: appConfig.maxPositionSize,
      scanInterval: 1000, // 1 second - scanning is in-memory only, no API calls
      // Rate limits: CLOB POST /order allows 3500 requests/10s (350/s burst) and 36000/10min (60/s sustained)
      // We only execute when opportunities are found, so scanning every 1s is safe
      enabled: false,
    }

    logger.info('Arbitrage detector initialized', {
      minProfitThreshold: this.config.minProfitThreshold,
      feeBuffer: this.config.feeBuffer,
      safetyMargin: this.config.safetyMargin,
      maxPositionSize: this.config.maxPositionSize,
    })
  }

  /**
   * Scan subscribed markets for arbitrage opportunities
   * Note: Only scans markets that are currently in the market store
   * (i.e., markets we're subscribed to and receiving data for)
   */
  scanOpportunities(): ArbitrageOpportunity[] {
    const markets = this.marketStore.getAllMarkets()
    const opportunities: ArbitrageOpportunity[] = []

    for (const market of markets) {
      // Skip stale markets
      if (market.isStale) {
        continue
      }

      // Skip markets we're already tracking
      if (this.trackedMarkets.has(market.marketId)) {
        continue
      }

      const opportunity = this.detectArbitrage(market)
      if (opportunity) {
        opportunities.push(opportunity)
      }
    }

    // Rank by profit margin (highest first)
    opportunities.sort((a, b) => b.profitAfterFees - a.profitAfterFees)

    return opportunities
  }

  /**
   * Detect arbitrage opportunity in a single market
   * Core condition: bestYesAsk + bestNoAsk < 1 - feeBuffer - safetyMargin
   */
  private detectArbitrage(market: MarketData): ArbitrageOpportunity | null {
    const yesAsk = market.yesPrices.ask
    const noAsk = market.noPrices.ask

    // Need both ask prices
    if (yesAsk === null || noAsk === null) {
      return null
    }

    // Skip if prices are 0 or invalid
    if (yesAsk <= 0 || noAsk <= 0) {
      return null
    }

    const totalCost = yesAsk + noAsk

    // Core arbitrage condition
    const requiredTotal = 1 - this.config.feeBuffer - this.config.safetyMargin

    if (totalCost >= requiredTotal) {
      return null // No arbitrage opportunity
    }

    const profitMargin = 1 - totalCost
    const profitAfterFees = profitMargin - this.config.feeBuffer

    // Check if profit meets minimum threshold
    if (profitAfterFees < this.config.minProfitThreshold) {
      return null
    }

    return {
      marketId: market.marketId,
      conditionId: market.conditionId,
      yesAsk,
      noAsk,
      totalCost,
      profitMargin,
      profitAfterFees,
      marketData: market,
      timestamp: Date.now(),
    }
  }

  /**
   * Create execution plan for an opportunity
   * Determines how much to spend on YES vs NO
   */
  createExecutionPlan(opportunity: ArbitrageOpportunity): ExecutionPlan | null {
    // For arbitrage, we want to buy equal value of YES and NO
    // This ensures we're hedged regardless of outcome
    const totalSize = Math.min(
      this.config.maxPositionSize,
      (this.config.maxPositionSize * opportunity.profitAfterFees) / this.config.minProfitThreshold
    )

    // Split equally between YES and NO
    const yesSize = totalSize / 2
    const noSize = totalSize / 2

    // Verify we still have an opportunity (prices might have changed)
    const currentMarket = this.marketStore.getMarket(opportunity.marketId)
    if (!currentMarket) {
      return null
    }

    const currentYesAsk = currentMarket.yesPrices.ask
    const currentNoAsk = currentMarket.noPrices.ask

    if (currentYesAsk === null || currentNoAsk === null) {
      return null
    }

    const currentTotalCost = currentYesAsk + currentNoAsk
    const currentProfitAfterFees =
      1 - currentTotalCost - this.config.feeBuffer - this.config.safetyMargin

    // Abort if opportunity disappeared
    if (currentProfitAfterFees < this.config.minProfitThreshold) {
      logger.debug('Arbitrage opportunity disappeared before execution', {
        marketId: opportunity.marketId,
        originalProfit: opportunity.profitAfterFees,
        currentProfit: currentProfitAfterFees,
      })
      return null
    }

    return {
      marketId: opportunity.marketId,
      conditionId: opportunity.conditionId,
      yesSize,
      noSize,
      yesPrice: currentYesAsk,
      noPrice: currentNoAsk,
      totalCost: yesSize + noSize,
      expectedProfit: (yesSize + noSize) * currentProfitAfterFees,
      timestamp: Date.now(),
    }
  }

  /**
   * Mark market as tracked (we've entered a position)
   */
  markMarketTracked(marketId: string): void {
    this.trackedMarkets.add(marketId)
    logger.debug('Market marked as tracked', { marketId })
  }

  /**
   * Remove market from tracking (position closed)
   */
  unmarkMarket(marketId: string): void {
    this.trackedMarkets.delete(marketId)
    logger.debug('Market unmarked', { marketId })
  }

  /**
   * Get tracked markets
   */
  getTrackedMarkets(): string[] {
    return Array.from(this.trackedMarkets)
  }

  /**
   * Check if market is being tracked
   */
  isMarketTracked(marketId: string): boolean {
    return this.trackedMarkets.has(marketId)
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...updates }
    logger.info('Arbitrage config updated', { config: this.config })
  }

  /**
   * Get current configuration
   */
  getConfig(): ArbitrageConfig {
    return { ...this.config }
  }

  /**
   * Enable/disable arbitrage detection
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    logger.info('Arbitrage detection', { enabled })
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }
}

