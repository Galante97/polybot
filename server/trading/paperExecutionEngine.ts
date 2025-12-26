/**
 * Paper execution engine
 * Simulates trades using real market data but no actual orders
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'
import { MarketStore } from '../market/marketStore.js'
import { getConfig } from '../config/env.js'
import type { IExecutionEngine } from './executionEngine.js'
import {
  TradeOrder,
  FillResult,
  Fill,
  Position,
  PnLSummary,
  TradeRecord,
  ExecutionMode,
  OrderStatus,
} from './types.js'

export class PaperExecutionEngine implements IExecutionEngine {
  private marketStore: MarketStore
  private positions: Map<string, Position> = new Map()
  private tradeHistory: TradeRecord[] = []
  private startingCapital: number
  private currentBalance: number
  private realizedPnL: number = 0

  constructor(marketStore: MarketStore) {
    this.marketStore = marketStore
    const config = getConfig()
    this.startingCapital = config.capital
    this.currentBalance = config.capital

    logger.info('Paper execution engine initialized', {
      startingCapital: this.startingCapital,
      mode: 'paper',
    })
  }

  async executeTrade(order: TradeOrder): Promise<FillResult> {
    if (order.mode !== 'paper') {
      throw new Error('Paper execution engine only handles paper trades')
    }

    // Determine fill price
    let fillPrice: number

    if (order.price) {
      // Limit order - use specified price (from copy trading API or user input)
      fillPrice = order.price
    } else {
      // Market order - need market data from store
    const market = this.marketStore.getMarket(order.marketId)
    if (!market) {
      return {
        orderId: order.orderId,
        fills: [],
        status: 'rejected',
        totalFilled: 0,
        averagePrice: 0,
        timestamp: Date.now(),
      }
    }

    const prices = order.side === 'YES' ? market.yesPrices : market.noPrices
      if (order.action === 'BUY') {
        fillPrice = prices.ask || 0
      } else {
        fillPrice = prices.bid || 0
      }
    }

    if (fillPrice === 0 || fillPrice === null || fillPrice <= 0 || fillPrice > 1) {
      return {
        orderId: order.orderId,
        fills: [],
        status: 'rejected',
        totalFilled: 0,
        averagePrice: 0,
        timestamp: Date.now(),
      }
    }

    // Calculate tokens received/sold
    const tokens = order.size / fillPrice
    const totalCost = order.size

    // Check balance for BUY orders
    if (order.action === 'BUY' && this.currentBalance < totalCost) {
      return {
        orderId: order.orderId,
        fills: [],
        status: 'rejected',
        totalFilled: 0,
        averagePrice: 0,
        timestamp: Date.now(),
      }
    }

    // Create fill
    const fill: Fill = {
      fillId: uuidv4(),
      orderId: order.orderId,
      price: fillPrice,
      size: order.size,
      timestamp: Date.now(),
    }

    // Update balance
    if (order.action === 'BUY') {
      this.currentBalance -= totalCost
    } else {
      this.currentBalance += totalCost
    }

    // Update position
    this.updatePosition(order, fillPrice, tokens)

    // Record trade
    const trade: TradeRecord = {
      tradeId: uuidv4(),
      orderId: order.orderId,
      marketId: order.marketId,
      conditionId: order.conditionId,
      side: order.side,
      action: order.action,
      size: order.size,
      price: fillPrice,
      status: 'filled',
      timestamp: Date.now(),
      mode: 'paper',
    }

    this.tradeHistory.push(trade)
    // Keep only last 1000 trades
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000)
    }

    logger.info('Paper trade executed', {
      orderId: order.orderId,
      marketId: order.marketId,
      side: order.side,
      action: order.action,
      size: order.size,
      price: fillPrice,
      tokens,
    })

    return {
      orderId: order.orderId,
      fills: [fill],
      status: 'filled',
      totalFilled: order.size,
      averagePrice: fillPrice,
      timestamp: Date.now(),
    }
  }

  private updatePosition(order: TradeOrder, price: number, tokens: number): void {
    let position = this.positions.get(order.marketId)

    if (!position) {
      position = {
        positionId: uuidv4(),
        marketId: order.marketId,
        conditionId: order.conditionId,
        yesTokens: 0,
        noTokens: 0,
        yesEntryPrice: 0,
        noEntryPrice: 0,
        yesCurrentPrice: null,
        noCurrentPrice: null,
        entryTimestamp: Date.now(),
        lastUpdate: Date.now(),
        unrealizedPnL: 0,
        totalEntryCost: 0,
      }
      this.positions.set(order.marketId, position)
    }

    // Update position based on side and action
    if (order.side === 'YES') {
      if (order.action === 'BUY') {
        // Add YES tokens
        const totalCost = position.yesTokens * position.yesEntryPrice + order.size
        position.yesTokens += tokens
        position.yesEntryPrice = totalCost / position.yesTokens
      } else {
        // Sell YES tokens
        position.yesTokens -= tokens
        if (position.yesTokens <= 0) {
          position.yesTokens = 0
          position.yesEntryPrice = 0
        }
      }
    } else {
      // NO side
      if (order.action === 'BUY') {
        // Add NO tokens
        const totalCost = position.noTokens * position.noEntryPrice + order.size
        position.noTokens += tokens
        position.noEntryPrice = totalCost / position.noTokens
      } else {
        // Sell NO tokens
        position.noTokens -= tokens
        if (position.noTokens <= 0) {
          position.noTokens = 0
          position.noEntryPrice = 0
        }
      }
    }

    position.totalEntryCost =
      position.yesTokens * position.yesEntryPrice + position.noTokens * position.noEntryPrice
    position.lastUpdate = Date.now()

    // Update current prices and PnL
    this.updatePositionPnL(position)
  }

  private updatePositionPnL(position: Position): void {
    const market = this.marketStore.getMarket(position.marketId)
    if (!market) {
      position.yesCurrentPrice = null
      position.noCurrentPrice = null
      position.unrealizedPnL = 0
      return
    }

    position.yesCurrentPrice = market.yesPrices.ask || market.yesPrices.bid || null
    position.noCurrentPrice = market.noPrices.ask || market.noPrices.bid || null

    // Calculate unrealized PnL
    const yesValue = position.yesTokens * (position.yesCurrentPrice || 0)
    const noValue = position.noTokens * (position.noCurrentPrice || 0)
    const currentValue = yesValue + noValue
    position.unrealizedPnL = currentValue - position.totalEntryCost
  }

  getPositions(): Position[] {
    // Update all positions with current prices
    for (const position of this.positions.values()) {
      this.updatePositionPnL(position)
    }
    return Array.from(this.positions.values())
  }

  getPosition(marketId: string): Position | undefined {
    const position = this.positions.get(marketId)
    if (position) {
      this.updatePositionPnL(position)
    }
    return position
  }

  async closePosition(marketId: string): Promise<FillResult[]> {
    const position = this.positions.get(marketId)
    if (!position) {
      return []
    }

    const results: FillResult[] = []

    // Close YES position if exists
    if (position.yesTokens > 0) {
      const market = this.marketStore.getMarket(marketId)
      const fillPrice = market?.yesPrices.bid || position.yesEntryPrice

      const order: TradeOrder = {
        orderId: uuidv4(),
        marketId,
        conditionId: position.conditionId,
        side: 'YES',
        action: 'SELL',
        size: position.yesTokens * fillPrice,
        mode: 'paper',
        timestamp: Date.now(),
      }

      const result = await this.executeTrade(order)
      results.push(result)

      // Calculate realized PnL
      const realized = position.yesTokens * (fillPrice - position.yesEntryPrice)
      this.realizedPnL += realized
    }

    // Close NO position if exists
    if (position.noTokens > 0) {
      const market = this.marketStore.getMarket(marketId)
      const fillPrice = market?.noPrices.bid || position.noEntryPrice

      const order: TradeOrder = {
        orderId: uuidv4(),
        marketId,
        conditionId: position.conditionId,
        side: 'NO',
        action: 'SELL',
        size: position.noTokens * fillPrice,
        mode: 'paper',
        timestamp: Date.now(),
      }

      const result = await this.executeTrade(order)
      results.push(result)

      // Calculate realized PnL
      const realized = position.noTokens * (fillPrice - position.noEntryPrice)
      this.realizedPnL += realized
    }

    // Remove position
    this.positions.delete(marketId)

    logger.info('Position closed', { marketId, results: results.length })

    // Notify arbitrage service that position is closed (if it exists)
    // This will be handled by the service that calls closePosition

    return results
  }

  async closeAllPositions(): Promise<FillResult[]> {
    const marketIds = Array.from(this.positions.keys())
    const allResults: FillResult[] = []

    for (const marketId of marketIds) {
      const results = await this.closePosition(marketId)
      allResults.push(...results)
    }

    return allResults
  }

  async redeemPosition(marketId: string, winningOutcome: 0 | 1): Promise<void> {
    const position = this.positions.get(marketId)
    if (!position) {
      logger.warn('Position not found for redemption', { marketId })
      return
    }

    const yesTokens = position.yesTokens || 0
    const noTokens = position.noTokens || 0

    // Calculate settlement proceeds based on winning outcome
    // Winner gets $1 per token, loser gets $0
    const settlementPrice = 1.0
    let settlementProceeds = 0
    let realizedPnL = 0

    if (winningOutcome === 0) {
      // YES won
      settlementProceeds = yesTokens * settlementPrice
      // Calculate PnL: (settlement price - entry price) * tokens
      realizedPnL = yesTokens * (settlementPrice - position.yesEntryPrice)
      // NO tokens are worthless
      realizedPnL += noTokens * (0 - position.noEntryPrice)
    } else {
      // NO won
      settlementProceeds = noTokens * settlementPrice
      // Calculate PnL: (settlement price - entry price) * tokens
      realizedPnL = noTokens * (settlementPrice - position.noEntryPrice)
      // YES tokens are worthless
      realizedPnL += yesTokens * (0 - position.yesEntryPrice)
    }

    // Update balance with settlement proceeds
    this.currentBalance += settlementProceeds

    // Update realized PnL
    this.realizedPnL += realizedPnL

    // Record redemption as a trade record
    const redemptionRecord: TradeRecord = {
      tradeId: uuidv4(),
      orderId: uuidv4(),
      marketId,
      conditionId: position.conditionId,
      side: winningOutcome === 0 ? 'YES' : 'NO',
      action: 'SELL', // Redemption is effectively selling winning tokens at $1
      size: settlementProceeds,
      price: settlementPrice,
      timestamp: Date.now(),
      status: 'filled',
      mode: 'paper',
    }

    this.tradeHistory.push(redemptionRecord)

    // Trim trade history if needed
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000)
    }

    // Remove position
    this.positions.delete(marketId)

    logger.info('✅ Position redeemed at settlement value', {
      marketId,
      winningOutcome: winningOutcome === 0 ? 'YES' : 'NO',
      yesTokens: yesTokens.toFixed(4),
      noTokens: noTokens.toFixed(4),
      settlementProceeds: settlementProceeds.toFixed(2),
      realizedPnL: realizedPnL.toFixed(2),
      newBalance: this.currentBalance.toFixed(2),
    })
  }

  getPnL(): PnLSummary {
    // Update all positions
    const positions = this.getPositions()
    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)

    return {
      totalRealizedPnL: this.realizedPnL,
      totalUnrealizedPnL,
      totalPnL: this.realizedPnL + totalUnrealizedPnL,
      startingCapital: this.startingCapital,
      currentBalance: this.currentBalance,
      openPositions: positions.length,
      closedPositions: this.tradeHistory.filter((t) => t.action === 'SELL').length,
    }
  }

  getBalance(): number {
    return this.currentBalance
  }

  getTradeHistory(limit: number = 100): TradeRecord[] {
    return this.tradeHistory.slice(-limit).reverse()
  }

  getMode(): ExecutionMode {
    return 'paper'
  }
}

