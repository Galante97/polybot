/**
 * Arbitrage Service
 * Orchestrates detection and execution of arbitrage opportunities
 */

import { logger } from '../utils/logger.js'
import { MarketStore } from '../market/marketStore.js'
import { ArbitrageDetector } from './arbitrageDetector.js'
import type { IExecutionEngine } from '../trading/executionEngine.js'
import type { ExecutionPlan, ArbitrageOpportunity } from './types.js'
import { v4 as uuidv4 } from 'uuid'
import type { TradeOrder } from '../trading/types.js'

export class ArbitrageService {
  private detector: ArbitrageDetector
  private executionEngine: IExecutionEngine
  private scanInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private scanDebounceTimer: NodeJS.Timeout | null = null
  private readonly scanDebounceMs = 100 // Debounce rapid updates to max 10 scans/second

  constructor(marketStore: MarketStore, executionEngine: IExecutionEngine) {
    this.detector = new ArbitrageDetector(marketStore)
    this.executionEngine = executionEngine

    // Register callback to scan on every market data update
    marketStore.onUpdate(() => {
      this.debouncedScan()
    })

    logger.info('Arbitrage service initialized', {
      scanMode: 'event-driven (on WebSocket updates)',
    })
  }

  /**
   * Start arbitrage detection and execution
   * Scanning is now event-driven (triggered by WebSocket updates)
   * We keep a fallback interval in case WebSocket stops updating
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Arbitrage service already running')
      return
    }

    this.isRunning = true
    this.detector.setEnabled(true)

    const config = this.detector.getConfig()

    // Fallback interval scan (in case WebSocket stops updating)
    // Set to 5 seconds as a safety net
    this.scanInterval = setInterval(() => {
      if (this.detector.isEnabled()) {
        this.scanAndExecute()
      }
    }, 5000)

    logger.info('✅ Arbitrage service started', {
      scanMode: 'event-driven (on WebSocket updates)',
      fallbackInterval: '5s (safety net)',
      minProfitThreshold: config.minProfitThreshold,
    })

    // Do initial scan immediately
    this.scanAndExecute()
  }

  /**
   * Stop arbitrage detection
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.detector.setEnabled(false)

    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }

    if (this.scanDebounceTimer) {
      clearTimeout(this.scanDebounceTimer)
      this.scanDebounceTimer = null
    }

    logger.info('Arbitrage service stopped')
  }

  /**
   * Debounced scan - prevents scanning too frequently if multiple updates come in rapid succession
   */
  private debouncedScan(): void {
    if (!this.isRunning || !this.detector.isEnabled()) {
      return
    }

    // Clear existing timer
    if (this.scanDebounceTimer) {
      clearTimeout(this.scanDebounceTimer)
    }

    // Schedule scan after debounce delay
    this.scanDebounceTimer = setTimeout(() => {
      this.scanAndExecute()
      this.scanDebounceTimer = null
    }, this.scanDebounceMs)
  }

  /**
   * Scan for opportunities and execute trades
   */
  private async scanAndExecute(): Promise<void> {
    if (!this.detector.isEnabled()) {
      return
    }

    try {
      const opportunities = this.detector.scanOpportunities()

      if (opportunities.length === 0) {
        logger.debug('No arbitrage opportunities found')
        return
      }

      logger.info('Found arbitrage opportunities', {
        count: opportunities.length,
        bestProfit: opportunities[0]?.profitAfterFees,
      })

      // Execute the best opportunity
      const bestOpportunity = opportunities[0]
      await this.executeArbitrage(bestOpportunity)
    } catch (error) {
      logger.error('Error in arbitrage scan', { error })
    }
  }

  /**
   * Execute an arbitrage opportunity
   * Places both YES and NO orders as close together as possible
   */
  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      // Create execution plan
      const plan = this.detector.createExecutionPlan(opportunity)
      if (!plan) {
        logger.debug('Execution plan creation failed - opportunity may have disappeared')
        return
      }

      logger.info('Executing arbitrage opportunity', {
        marketId: plan.marketId,
        yesSize: plan.yesSize,
        noSize: plan.noSize,
        expectedProfit: plan.expectedProfit,
      })

      // Check if we already have a position in this market
      const existingPosition = this.executionEngine.getPosition(plan.marketId)
      if (existingPosition) {
        logger.debug('Already have position in market, skipping', {
          marketId: plan.marketId,
        })
        return
      }

      // Check balance
      const balance = this.executionEngine.getBalance()
      if (balance < plan.totalCost) {
        logger.warn('Insufficient balance for arbitrage', {
          balance,
          required: plan.totalCost,
        })
        return
      }

      // Execute both legs
      const yesOrder: TradeOrder = {
        orderId: uuidv4(),
        marketId: plan.marketId,
        conditionId: plan.conditionId,
        side: 'YES',
        action: 'BUY',
        size: plan.yesSize,
        price: plan.yesPrice, // Use limit price
        mode: 'paper',
        timestamp: Date.now(),
      }

      const noOrder: TradeOrder = {
        orderId: uuidv4(),
        marketId: plan.marketId,
        conditionId: plan.conditionId,
        side: 'NO',
        action: 'BUY',
        size: plan.noSize,
        price: plan.noPrice, // Use limit price
        mode: 'paper',
        timestamp: Date.now(),
      }

      // Execute both orders
      const yesResult = await this.executionEngine.executeTrade(yesOrder)
      const noResult = await this.executionEngine.executeTrade(noOrder)

      // Check if both legs filled
      if (yesResult.status === 'filled' && noResult.status === 'filled') {
        // Mark market as tracked
        this.detector.markMarketTracked(plan.marketId)
        logger.info('✅ Arbitrage position opened', {
          marketId: plan.marketId,
          yesFilled: yesResult.totalFilled,
          noFilled: noResult.totalFilled,
        })
      } else {
        // One leg failed - log warning
        logger.warn('Arbitrage execution partial/failed', {
          marketId: plan.marketId,
          yesStatus: yesResult.status,
          noStatus: noResult.status,
        })

        // If only one leg filled, we have a problem
        // For now, just log it - risk manager will handle this in Milestone 4
        if (yesResult.status === 'filled' && noResult.status !== 'filled') {
          logger.error('YES leg filled but NO leg failed - unhedged position!', {
            marketId: plan.marketId,
          })
        } else if (noResult.status === 'filled' && yesResult.status !== 'filled') {
          logger.error('NO leg filled but YES leg failed - unhedged position!', {
            marketId: plan.marketId,
          })
        }
      }
    } catch (error) {
      logger.error('Error executing arbitrage', { error, opportunity })
    }
  }

  /**
   * Get arbitrage detector
   */
  getDetector(): ArbitrageDetector {
    return this.detector
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean
    enabled: boolean
    trackedMarkets: number
    opportunities: number
  } {
    const opportunities = this.detector.scanOpportunities()
    return {
      running: this.isRunning,
      enabled: this.detector.isEnabled(),
      trackedMarkets: this.detector.getTrackedMarkets().length,
      opportunities: opportunities.length,
    }
  }
}

