/**
 * In-memory market data store
 * Maintains latest order book snapshots for all tracked markets
 */

import { MarketData, OutcomePrices, OrderBookUpdate } from './types.js'
import { logger } from '../utils/logger.js'

export class MarketStore {
  private markets: Map<string, MarketData> = new Map()
  private staleThresholdMs: number
  private onUpdateCallbacks: Set<() => void> = new Set() // Callbacks to trigger on data updates

  constructor(staleThresholdMs: number = 30000) {
    // Default: 30 seconds
    this.staleThresholdMs = staleThresholdMs
  }

  /**
   * Register a callback to be called when market data is updated
   */
  onUpdate(callback: () => void): void {
    this.onUpdateCallbacks.add(callback)
  }

  /**
   * Unregister an update callback
   */
  offUpdate(callback: () => void): void {
    this.onUpdateCallbacks.delete(callback)
  }

  /**
   * Trigger all update callbacks
   */
  private triggerUpdateCallbacks(): void {
    for (const callback of this.onUpdateCallbacks) {
      try {
        callback()
      } catch (error) {
        // Log error but don't break other callbacks
        logger.error('Error in market update callback', { error })
      }
    }
  }

  /**
   * Update order book for a specific market outcome
   * Uses assetId to identify the token (YES or NO)
   */
  updateOrderBook(update: OrderBookUpdate): void {
    const { marketId, conditionId, assetId, outcome, bids, asks, timestamp } = update

    // If we don't have marketId/conditionId yet, try to use assetId as key
    // This is a temporary solution until we have proper market metadata mapping
    const key = marketId || conditionId || assetId

    // Get or create market data
    let marketData = this.markets.get(key)
    if (!marketData) {
      marketData = {
        marketId: marketId || assetId, // Use assetId as fallback
        conditionId: conditionId || assetId, // Use assetId as fallback
        yesPrices: this.createEmptyPrices(),
        noPrices: this.createEmptyPrices(),
        lastUpdate: timestamp,
        isStale: false,
      }
      this.markets.set(key, marketData)
    }

    // Extract best bid/ask
    const bestBid = this.extractBestBid(bids)
    const bestAsk = this.extractBestAsk(asks)

    // Update the appropriate outcome (YES or NO)
    const prices = outcome === 'YES' ? marketData.yesPrices : marketData.noPrices
    prices.bid = bestBid
    prices.ask = bestAsk
    prices.lastUpdate = timestamp

    // Update market-level timestamp
    marketData.lastUpdate = Math.max(marketData.lastUpdate, timestamp)
    marketData.isStale = this.isStale(marketData.lastUpdate)

    logger.info('✅ Market data updated in store', {
      marketId: key,
      conditionId,
      assetId,
      outcome,
      bestBid,
      bestAsk,
      yesAsk: marketData.yesPrices.ask,
      noAsk: marketData.noPrices.ask,
      timestamp,
    })

    // Trigger callbacks (e.g., arbitrage scanner, price history) when data is updated
    // Only trigger if we have both YES and NO prices (complete market data)
    if (marketData.yesPrices.ask !== null && marketData.noPrices.ask !== null) {
      this.triggerUpdateCallbacks()
    }
  }

  /**
   * Get current market data
   */
  getMarket(marketId: string): MarketData | undefined {
    const market = this.markets.get(marketId)
    if (market) {
      // Check staleness on read
      market.isStale = this.isStale(market.lastUpdate)
    }
    return market
  }

  /**
   * Get all markets
   */
  getAllMarkets(): MarketData[] {
    const now = Date.now()
    return Array.from(this.markets.values()).map((market) => {
      market.isStale = this.isStale(market.lastUpdate)
      return market
    })
  }

  /**
   * Get markets with arbitrage opportunities
   * Returns markets where YES + NO ask prices < 1 (before fees)
   */
  getArbitrageOpportunities(feeBuffer: number = 0): MarketData[] {
    return this.getAllMarkets().filter((market) => {
      const yesAsk = market.yesPrices.ask
      const noAsk = market.noPrices.ask

      if (yesAsk === null || noAsk === null) {
        return false
      }

      const totalCost = yesAsk + noAsk
      return totalCost < 1 - feeBuffer && !market.isStale
    })
  }

  /**
   * Remove market from store
   */
  removeMarket(marketId: string): boolean {
    return this.markets.delete(marketId)
  }

  /**
   * Clear all markets
   */
  clear(): void {
    this.markets.clear()
    logger.info('Market store cleared')
  }

  /**
   * Get count of tracked markets
   */
  getMarketCount(): number {
    return this.markets.size
  }

  /**
   * Extract best bid from order book
   */
  private extractBestBid(bids: { price: string; size: string }[]): number | null {
    if (!bids || bids.length === 0) {
      return null
    }

    // Bids are typically sorted highest to lowest
    // Best bid is the highest price
    const bestBid = bids[0]
    const price = parseFloat(bestBid.price)
    return isNaN(price) ? null : price
  }

  /**
   * Extract best ask from order book
   */
  private extractBestAsk(asks: { price: string; size: string }[]): number | null {
    if (!asks || asks.length === 0) {
      return null
    }

    // Asks are typically sorted lowest to highest
    // Best ask is the lowest price
    const bestAsk = asks[0]
    const price = parseFloat(bestAsk.price)
    return isNaN(price) ? null : price
  }

  /**
   * Create empty prices object
   */
  private createEmptyPrices(): OutcomePrices {
    return {
      bid: null,
      ask: null,
      lastUpdate: 0,
    }
  }

  /**
   * Check if market data is stale
   */
  private isStale(lastUpdate: number): boolean {
    const now = Date.now()
    return now - lastUpdate > this.staleThresholdMs
  }

  /**
   * Set stale threshold
   */
  setStaleThreshold(thresholdMs: number): void {
    this.staleThresholdMs = thresholdMs
    logger.info('Stale threshold updated', { thresholdMs })
  }
}

