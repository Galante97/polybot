/**
 * Price History Service
 * Tracks price changes over time for markets
 */

import { logger } from '../utils/logger.js'
import type { MarketData } from './types.js'

export interface PriceHistoryEntry {
  timestamp: number
  marketId: string
  conditionId: string
  yesAsk: number | null
  yesBid: number | null
  noAsk: number | null
  noBid: number | null
  totalCost: number | null // YES ask + NO ask
  profitMargin: number | null // 1 - totalCost
}

export interface MarketPriceHistory {
  marketId: string
  conditionId: string
  entries: PriceHistoryEntry[]
  startTime: number
  endTime: number | null
}

export class PriceHistoryService {
  private history: Map<string, MarketPriceHistory> = new Map()
  private isTracking = false
  private trackingStartTime: number | null = null

  /**
   * Start tracking price history
   */
  startTracking(): void {
    if (this.isTracking) {
      logger.warn('Price history tracking already started')
      return
    }

    this.isTracking = true
    this.trackingStartTime = Date.now()
    this.history.clear() // Clear previous history
    logger.info('📊 Price history tracking started')
  }

  /**
   * Stop tracking price history
   */
  stopTracking(): void {
    if (!this.isTracking) {
      return
    }

    this.isTracking = false
    const endTime = Date.now()

    // Mark end time for all active histories
    for (const history of this.history.values()) {
      history.endTime = endTime
    }

    logger.info('📊 Price history tracking stopped', {
      marketsTracked: this.history.size,
      duration: endTime - (this.trackingStartTime || 0),
    })
  }

  /**
   * Record price update for a market
   */
  recordUpdate(market: MarketData): void {
    if (!this.isTracking) {
      return
    }

    const yesAsk = market.yesPrices.ask
    const yesBid = market.yesPrices.bid
    const noAsk = market.noPrices.ask
    const noBid = market.noPrices.bid

    // Only record if we have both ask prices (can calculate arbitrage)
    if (yesAsk === null || noAsk === null) {
      return
    }

    const totalCost = yesAsk + noAsk
    const profitMargin = 1 - totalCost

    const entry: PriceHistoryEntry = {
      timestamp: Date.now(),
      marketId: market.marketId,
      conditionId: market.conditionId,
      yesAsk,
      yesBid,
      noAsk,
      noBid,
      totalCost,
      profitMargin: profitMargin > 0 ? profitMargin : null, // Only positive margins
    }

    // Get or create history for this market
    let marketHistory = this.history.get(market.marketId)
    if (!marketHistory) {
      marketHistory = {
        marketId: market.marketId,
        conditionId: market.conditionId,
        entries: [],
        startTime: this.trackingStartTime || Date.now(),
        endTime: null,
      }
      this.history.set(market.marketId, marketHistory)
    }

    // Add entry (limit to last 1000 entries per market to prevent memory issues)
    marketHistory.entries.push(entry)
    if (marketHistory.entries.length > 1000) {
      marketHistory.entries.shift() // Remove oldest entry
    }

    marketHistory.endTime = Date.now()
  }

  /**
   * Get price history for a specific market
   */
  getMarketHistory(marketId: string): MarketPriceHistory | null {
    return this.history.get(marketId) || null
  }

  /**
   * Get price history for all markets
   */
  getAllHistory(): MarketPriceHistory[] {
    return Array.from(this.history.values())
  }

  /**
   * Get price history summary (latest prices for all markets)
   */
  getHistorySummary(): Array<{
    marketId: string
    conditionId: string
    latestEntry: PriceHistoryEntry | null
    entryCount: number
    minTotalCost: number | null
    maxTotalCost: number | null
    minProfitMargin: number | null
    maxProfitMargin: number | null
  }> {
    return Array.from(this.history.values()).map((history) => {
      const latestEntry = history.entries[history.entries.length - 1] || null
      const costs = history.entries
        .map((e) => e.totalCost)
        .filter((c): c is number => c !== null)
      const margins = history.entries
        .map((e) => e.profitMargin)
        .filter((m): m is number => m !== null)

      return {
        marketId: history.marketId,
        conditionId: history.conditionId,
        latestEntry,
        entryCount: history.entries.length,
        minTotalCost: costs.length > 0 ? Math.min(...costs) : null,
        maxTotalCost: costs.length > 0 ? Math.max(...costs) : null,
        minProfitMargin: margins.length > 0 ? Math.min(...margins) : null,
        maxProfitMargin: margins.length > 0 ? Math.max(...margins) : null,
      }
    })
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history.clear()
    this.trackingStartTime = null
    logger.info('Price history cleared')
  }

  /**
   * Check if tracking is active
   */
  isTrackingActive(): boolean {
    return this.isTracking
  }

  /**
   * Get tracking start time
   */
  getTrackingStartTime(): number | null {
    return this.trackingStartTime
  }
}

