/**
 * Copy Trading Service
 * Monitors tracked users' trades and executes similar trades
 */

import { logger } from '../utils/logger.js'
import type { IExecutionEngine } from '../trading/executionEngine.js'
import type { TradeOrder } from '../trading/types.js'
import type { TrackedUser, PolymarketTrade, DetectedTrade, CopyTradingConfig, MarketData } from './types.js'
import { v4 as uuidv4 } from 'uuid'

const POLYMARKET_ACTIVITY_API_URL = 'https://data-api.polymarket.com/activity'
const POLYMARKET_MARKETS_API_URL = 'https://gamma-api.polymarket.com/markets'
const RATE_LIMIT_REQUESTS = 200 // requests per 10 seconds
const RATE_LIMIT_WINDOW_MS = 10000 // 10 seconds
const POLL_INTERVAL_MS = 5000 // Poll every 5 seconds

export class CopyTradingService {
  private executionEngine: IExecutionEngine
  private config: CopyTradingConfig
  private pollInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private seenTransactionHashes: Set<string> = new Set()
  private detectedTrades: DetectedTrade[] = []
  private lastPollTime: number = 0
  private rateLimitQueue: Array<{ timestamp: number; resolve: () => void }> = []
  private rateLimitRequests: number[] = [] // Track request timestamps for rate limiting
  // Track recent trade sizes per user for proportional scaling
  // Map<userAddress, Map<txHash, size>> - tracking by hash prevents double-counting
  private userTradeHistory: Map<string, Map<string, number>> = new Map()
  private isInitialPoll: boolean = true // Track if this is the first poll after startup
  // Cache market data to avoid repeated API calls
  private marketDataCache: Map<string, { data: MarketData; timestamp: number }> = new Map()
  private MARKET_CACHE_TTL_MS = 60000 // Cache market data for 1 minute

  constructor(executionEngine: IExecutionEngine, trackedUsers: TrackedUser[] = []) {
    this.executionEngine = executionEngine

    // Hardcoded list of users to track (can be made configurable later)
    const defaultUsers: TrackedUser[] = [
      // Add your tracked users here
      // Example:
      { address: '0xb2e4567925b79231265adf5d54687ddfb761bc51', name: 'Cortisfans' },
      { address: '0xb2a922eda6b288af1248f461afc7ab8504cf0a5d', name: '0xb2A922' },
      { address: '0x1438a5e34633516e4a806695e593f49edec7bce4', name: 'solarismm' },
      { address: '0x0a55f6b56bd976ae3ddfbffc9c2c4b70a0f9f9be', name: '4444Fours' },
      { address: '0x42592084120b0d5287059919d2a96b3b7acb936f', name: 'antman-batman-superman-lakers-in-5' },
      { address: '0x492442EaB586F242B53bDa933fD5dE859c8A3782', name: '0x49244' },
      { address: '0xbda318d7996bdf1a36f8e557bf38d7abb6a1cab2', name: '0xbda318d' },
      { address: '0x5350afcd8bd8ceffdf4da32420d6d31be0822fda', name: 'simonbanza' },
      { address: '0xd38b71f3e8ed1af71983e5c309eac3dfa9b35029', name: 'primm' },
      { address: '0xa49becb692927d455924583b5e3e5788246f4c40', name: 'sleepy-panda' },
      { address: '0xf1ffa0a8bc7cdeb0240027e623b026ced4d0e56a', name: 'CcCcChang' },
      { address: '0x53757615de1c42b83f893b79d4241a009dc2aeea', name: 'Anon' },
      { address: '0x8ca8445e5c0dda8dcfeef768c074dbd66b07bf49', name: 'dreamerwon' },
      { address: '0x37e4728b3c4607fb2b3b205386bb1d1fb1a8c991', name: 'SemyonMarmeladov' },
      { address: '0xbcc9608ff5481e8452173a2236ffd735fad726fb', name: '210MM' },
      { address: '0xbacd00c9080a82ded56f504ee8810af732b0ab35', name: 'ScottyNooo' },
      { address: '0x1d1ade627d0bb0205758580b20d808573e720df6', name: 'Pwaddler' },
    ]

    this.config = {
      pollIntervalMs: POLL_INTERVAL_MS,
      enabled: false,
      trackedUsers: trackedUsers.length > 0 ? trackedUsers : defaultUsers,
      minTradeSize: 10, // Minimum $10 trade to execute (absolute minimum)
      maxTradeSize: 1000, // Maximum trade size we'll execute (our max position size)
      recentTradesWindow: 15, // Track last 10 trades for volume calculation
      minVolumeForScaling: 1000, // Need at least $1000 in recent volume to use proportional scaling
    }

    logger.info('Copy trading service initialized', {
      trackedUsersCount: this.config.trackedUsers.length,
    })
  }

  /**
   * Start copy trading service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Copy trading service already running')
      return
    }

    if (this.config.trackedUsers.length === 0) {
      logger.warn('No users tracked. Add users before starting copy trading.')
      return
    }

    this.isRunning = true
    this.config.enabled = true
    this.isInitialPoll = true // Mark that we're doing the initial poll

    // Do initial poll to mark existing trades as seen (without executing)
    this.pollForTrades()

    // Set up polling interval
    this.pollInterval = setInterval(() => {
      if (this.config.enabled) {
        this.pollForTrades()
      }
    }, this.config.pollIntervalMs)

    logger.info('✅ Copy trading service started', {
      trackedUsers: this.config.trackedUsers.length,
      pollInterval: this.config.pollIntervalMs,
    })
  }

  /**
   * Stop copy trading service
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.config.enabled = false
    this.isInitialPoll = true // Reset so next start will skip historical trades

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    logger.info('Copy trading service stopped')
  }

  /**
   * Poll for new trades from tracked users
   */
  private async pollForTrades(): Promise<void> {
    if (!this.config.enabled || this.config.trackedUsers.length === 0) {
      return
    }

    try {
      // Respect rate limits: 200 requests / 10 seconds
      await this.waitForRateLimit()

      // Poll each user sequentially to respect rate limits
      for (const user of this.config.trackedUsers) {
        await this.fetchUserTrades(user)
        // Small delay between users to be safe with rate limits
        await this.sleep(50)
      }

      // After initial poll completes, mark that we're done with initial setup
      if (this.isInitialPoll) {
        this.isInitialPoll = false
        logger.info('Initial poll complete - historical trades marked as seen. Now monitoring for new trades only.')
      }

      this.lastPollTime = Date.now()
    } catch (error) {
      logger.error('Error polling for trades', { error })
    }
  }

  /**
   * Fetch activities (trades, redemptions, etc.) for a specific user
   */
  private async fetchUserTrades(user: TrackedUser): Promise<void> {
    try {
      const url = new URL(POLYMARKET_ACTIVITY_API_URL)
      url.searchParams.set('user', user.address)
      url.searchParams.set('limit', '10') // Get most recent 10 activities
      url.searchParams.set('offset', '0')

      const response = await this.fetchWithRateLimit(url.toString())

      if (!response.ok) {
        logger.warn('Failed to fetch activities for user', {
          user: user.address,
          status: response.status,
        })
        return
      }

      const activities: PolymarketTrade[] = await response.json()

      // Update trade history for this user (for proportional scaling)
      const userAddress = user.address.toLowerCase()
      let tradeHistory = this.userTradeHistory.get(userAddress)
      if (!tradeHistory) {
        tradeHistory = new Map<string, number>()
        this.userTradeHistory.set(userAddress, tradeHistory)
      }
      const windowSize = this.config.recentTradesWindow || 10

      // Add all fetched activities to history (tracked by transaction hash to prevent duplicates)
      // Only count TRADE activities for volume calculation
      for (const activity of activities) {
        if (activity.type === 'TRADE' || !activity.type) {
          tradeHistory.set(activity.transactionHash, activity.size)

          // Keep only the most recent N trades (oldest first)
          if (tradeHistory.size > windowSize) {
            // Remove the oldest entry (first one in iteration order)
            const firstHash = tradeHistory.keys().next().value
            if (firstHash) {
              tradeHistory.delete(firstHash)
            }
          }
        }
      }

      // On initial poll, just mark all activities as seen without executing
      // After initial poll, only execute activities we haven't seen before
      if (this.isInitialPoll) {
        // Mark all activities as seen without executing
        for (const activity of activities) {
          this.seenTransactionHashes.add(activity.transactionHash)
        }
      } else {
        // Process only NEW activities (ones we haven't copied yet)
        for (const activity of activities) {
          // Check if we've seen this activity before
          if (!this.seenTransactionHashes.has(activity.transactionHash)) {
            this.seenTransactionHashes.add(activity.transactionHash)

            // Process the new activity based on type
            if (activity.type === 'REDEEM') {
              await this.handleRedemption(activity, user)
            } else if (activity.type === 'TRADE' || !activity.type) {
              // Process trade (history already updated, but we'll exclude this trade in calculation)
              await this.handleNewTrade(activity, user)
            }
            // Ignore other types (SPLIT, MERGE, REWARD, CONVERSION) for now
          }
        }
      }

      // Update user info from activities if available
      if (activities.length > 0 && activities[0].name) {
        user.name = user.name || activities[0].name
        user.pseudonym = activities[0].pseudonym || user.pseudonym
        user.bio = activities[0].bio || user.bio
        user.profileImage = activities[0].profileImageOptimized || activities[0].profileImage || user.profileImage
      }
    } catch (error) {
      logger.error('Error fetching user trades', {
        user: user.address,
        error,
      })
    }
  }

  /**
   * Calculate proportional copy size based on user's recent trading pattern
   * @param tradeSize - Size of the trade we're about to copy
   * @param tradeHash - Transaction hash of the trade (to exclude it from volume calculation)
   * @param userAddress - Address of the tracked user
   */
  private calculateProportionalSize(tradeSize: number, tradeHash: string, userAddress: string): number {
    const tradeHistory = this.userTradeHistory.get(userAddress.toLowerCase())
    const minVolumeForScaling = this.config.minVolumeForScaling || 1000
    const maxTradeSize = this.config.maxTradeSize || 1000

    // If we don't have trade history, use a conservative default
    if (!tradeHistory || tradeHistory.size < 2) {
      // Not enough history - use 10% of max as a conservative default
      return Math.max(this.config.minTradeSize || 10, maxTradeSize * 0.1)
    }

    // Calculate recent volume EXCLUDING the current trade we're about to copy
    // This gives us the volume of previous trades only
    let recentVolume = 0
    for (const [hash, size] of tradeHistory.entries()) {
      if (hash !== tradeHash) {
        recentVolume += size
      }
    }

    // If recent volume is too small, use a simple percentage
    if (recentVolume < minVolumeForScaling) {
      // Use a conservative default: 5% of max trade size
      return Math.max(this.config.minTradeSize || 10, maxTradeSize * 0.05)
    }

    // Calculate what percentage of recent volume this trade represents
    const tradePercentageOfRecentVolume = (tradeSize / recentVolume) * 100

    // Scale our copy size proportionally
    // If this trade is X% of their recent volume, our copy should be X% of our max trade size
    const proportionalSize = (maxTradeSize * tradePercentageOfRecentVolume) / 100

    // Ensure we meet minimum trade size
    const finalSize = Math.max(this.config.minTradeSize || 10, proportionalSize)

    // Ensure we don't exceed maximum
    return Math.min(finalSize, maxTradeSize)
  }

  /**
   * Handle a new trade detected from a tracked user
   */
  private async handleNewTrade(trade: PolymarketTrade, user: TrackedUser): Promise<void> {
    const tradeSize = trade.size
    const tradeHash = trade.transactionHash
    const userAddress = user.address.toLowerCase()

    // Skip trades that are too small (absolute minimum)
    if (this.config.minTradeSize && tradeSize < this.config.minTradeSize * 0.5) {
      logger.debug('Trade too small to copy', {
        transactionHash: tradeHash,
        size: tradeSize,
        minSize: this.config.minTradeSize,
      })
      return
    }

    // Calculate proportional copy size based on user's recent trading pattern
    // Exclude this trade from the volume calculation
    const copySize = this.calculateProportionalSize(tradeSize, tradeHash, userAddress)

    // Get recent volume for logging (excluding current trade)
    const tradeHistory = this.userTradeHistory.get(userAddress)
    let recentVolume = 0
    if (tradeHistory) {
      for (const [hash, size] of tradeHistory.entries()) {
        if (hash !== tradeHash) {
          recentVolume += size
        }
      }
    }
    const tradePercentageOfVolume = recentVolume > 0 
      ? ((tradeSize / recentVolume) * 100).toFixed(2)
      : 'N/A'

    // Create detected trade record
    const detectedTrade: DetectedTrade = {
      trade,
      trackedUser: user,
      detectedAt: Date.now(),
      executed: false,
    }

    this.detectedTrades.push(detectedTrade)

    logger.info('📋 New trade detected from tracked user', {
      user: user.name || user.address,
      side: trade.side,
      market: trade.title || trade.conditionId,
      originalSize: tradeSize,
      recentVolume: recentVolume.toFixed(2),
      tradePercentageOfVolume: `${tradePercentageOfVolume}%`,
      calculatedCopySize: copySize.toFixed(2),
      price: trade.price,
      transactionHash: trade.transactionHash,
    })

    // Execute the copy trade with calculated proportional size
    await this.executeCopyTrade(detectedTrade, copySize)
  }

  /**
   * Execute a copy trade based on detected trade
   */
  private async executeCopyTrade(detectedTrade: DetectedTrade, copySize: number): Promise<void> {
    const { trade, trackedUser } = detectedTrade

    try {
      const originalSize = trade.size

      // Determine side based on trade
      const side: 'YES' | 'NO' = trade.outcome === 'Yes' || trade.outcome === 'YES' ? 'YES' : 'NO'

      // Determine action (BUY or SELL)
      const action: 'BUY' | 'SELL' = trade.side

      // For SELL orders, check if we have a position to sell
      if (action === 'SELL') {
        const existingPosition = this.executionEngine.getPosition(trade.conditionId)
        if (!existingPosition) {
          logger.warn('Cannot execute SELL - no position exists', {
            marketId: trade.conditionId,
            transactionHash: trade.transactionHash,
          })
          detectedTrade.executionError = 'No position exists to sell'
          return
        }

        // Check if we have enough tokens to sell
        const tokensToSell = copySize / trade.price
        const availableTokens = side === 'YES' ? existingPosition.yesTokens : existingPosition.noTokens

        if (tokensToSell > availableTokens) {
          logger.warn('Cannot execute SELL - insufficient tokens', {
            marketId: trade.conditionId,
            side,
            tokensToSell,
            availableTokens,
            transactionHash: trade.transactionHash,
          })
          detectedTrade.executionError = `Insufficient tokens to sell (have: ${availableTokens.toFixed(4)}, need: ${tokensToSell.toFixed(4)})`
          
          // Optionally: sell what we have instead of rejecting
          // For now, we'll reject to be safe
          return
        }
      }

      // Create trade order
      const order: TradeOrder = {
        orderId: uuidv4(),
        marketId: trade.conditionId, // Using conditionId as marketId
        conditionId: trade.conditionId,
        side,
        action,
        size: copySize,
        price: trade.price, // Use the same price
        mode: 'paper',
        timestamp: Date.now(),
      }

      logger.info('📊 Executing copy trade', {
        originalSize,
        copySize,
        side,
        action,
        market: trade.title || trade.conditionId,
        user: trackedUser.name || trackedUser.address,
      })

      // Execute the trade
      const result = await this.executionEngine.executeTrade(order)

      if (result.status === 'filled' || result.status === 'partial') {
        detectedTrade.executed = true
        detectedTrade.executedAt = Date.now()
        logger.info('✅ Copy trade executed successfully', {
          transactionHash: trade.transactionHash,
          status: result.status,
          filled: result.totalFilled,
        })
      } else {
        detectedTrade.executionError = `Trade status: ${result.status}`
        logger.warn('Copy trade execution failed', {
          transactionHash: trade.transactionHash,
          status: result.status,
        })
      }
    } catch (error) {
      detectedTrade.executionError =
        error instanceof Error ? error.message : String(error)
      logger.error('Error executing copy trade', {
        error,
        transactionHash: trade.transactionHash,
      })
    }
  }

  /**
   * Handle a redemption activity from a tracked user
   */
  private async handleRedemption(activity: PolymarketTrade, user: TrackedUser): Promise<void> {
    try {
      const conditionId = activity.conditionId
      const transactionHash = activity.transactionHash

      logger.info('🔔 Redemption detected from tracked user', {
        user: user.name || user.address,
        market: activity.title || conditionId,
        transactionHash,
      })

      // Check if we have a position in this market
      const existingPosition = this.executionEngine.getPosition(conditionId)
      if (!existingPosition) {
        logger.debug('No matching position to redeem', {
          marketId: conditionId,
          transactionHash,
        })
        return
      }

      // Fetch market data to determine winning outcome
      const marketData = await this.fetchMarketData(conditionId)
      if (!marketData) {
        logger.warn('Could not fetch market data for redemption', {
          conditionId,
          transactionHash,
        })
        return
      }

      // Check if market is actually closed/resolved
      if (!marketData.closed) {
        logger.warn('Market not closed yet, skipping redemption', {
          conditionId,
          transactionHash,
        })
        return
      }

      // Determine winning outcome from outcomePrices
      const winningOutcome = this.determineWinningOutcome(marketData)
      if (winningOutcome === null) {
        logger.warn('Could not determine winning outcome', {
          conditionId,
          outcomePrices: marketData.outcomePrices,
          transactionHash,
        })
        return
      }

      // Redeem our position with settlement value
      await this.redeemPosition(existingPosition, winningOutcome, marketData)

      logger.info('✅ Position redeemed successfully', {
        conditionId,
        winningOutcome,
        transactionHash,
      })
    } catch (error) {
      logger.error('Error handling redemption', {
        error,
        conditionId: activity.conditionId,
        transactionHash: activity.transactionHash,
      })
    }
  }

  /**
   * Fetch market data from Gamma API
   */
  private async fetchMarketData(conditionId: string): Promise<MarketData | null> {
    try {
      // Check cache first
      const cached = this.marketDataCache.get(conditionId)
      if (cached && Date.now() - cached.timestamp < this.MARKET_CACHE_TTL_MS) {
        return cached.data
      }

      // Fetch from API
      const url = `${POLYMARKET_MARKETS_API_URL}/${conditionId}`
      const response = await this.fetchWithRateLimit(url)

      if (!response.ok) {
        logger.warn('Failed to fetch market data', {
          conditionId,
          status: response.status,
        })
        return null
      }

      const marketData: MarketData = await response.json()

      // Cache the result
      this.marketDataCache.set(conditionId, {
        data: marketData,
        timestamp: Date.now(),
      })

      return marketData
    } catch (error) {
      logger.error('Error fetching market data', {
        error,
        conditionId,
      })
      return null
    }
  }

  /**
   * Determine winning outcome from market data
   * Returns 0 for YES, 1 for NO, or null if uncertain
   */
  private determineWinningOutcome(marketData: MarketData): 0 | 1 | null {
    if (!marketData.outcomePrices) {
      return null
    }

    try {
      const prices = JSON.parse(marketData.outcomePrices) as number[]
      if (!Array.isArray(prices) || prices.length !== 2) {
        return null
      }

      // Winner should have price very close to 1.00
      // Loser should have price very close to 0.00
      const [yesPrice, noPrice] = prices

      if (yesPrice > 0.9 && noPrice < 0.1) {
        return 0 // YES won
      } else if (noPrice > 0.9 && yesPrice < 0.1) {
        return 1 // NO won
      }

      // Uncertain - prices don't clearly indicate a winner
      return null
    } catch (error) {
      logger.error('Error parsing outcome prices', {
        error,
        outcomePrices: marketData.outcomePrices,
      })
      return null
    }
  }

  /**
   * Redeem a position using settlement values ($1 for winner, $0 for loser)
   */
  private async redeemPosition(
    position: any,
    winningOutcome: 0 | 1,
    marketData: MarketData
  ): Promise<void> {
    const conditionId = position.conditionId
    const yesTokens = position.yesTokens || 0
    const noTokens = position.noTokens || 0

    // Calculate settlement proceeds
    const yesValue = winningOutcome === 0 ? yesTokens * 1.0 : 0 // $1 per token if YES won
    const noValue = winningOutcome === 1 ? noTokens * 1.0 : 0 // $1 per token if NO won
    const totalSettlementValue = yesValue + noValue

    logger.info('💰 Redeeming position at settlement value', {
      market: marketData.conditionId,
      yesTokens: yesTokens.toFixed(4),
      noTokens: noTokens.toFixed(4),
      winningOutcome: winningOutcome === 0 ? 'YES' : 'NO',
      settlementValue: totalSettlementValue.toFixed(2),
    })

    // Redeem the position using the execution engine's redeem method
    // This will calculate settlement value correctly and update balance/PnL
    try {
      await this.executionEngine.redeemPosition(conditionId, winningOutcome)

      logger.info('✅ Position redeemed via execution engine', {
        conditionId,
        winningOutcome: winningOutcome === 0 ? 'YES' : 'NO',
      })
    } catch (error) {
      logger.error('Error redeeming position', {
        error,
        conditionId,
      })
    }
  }

  /**
   * Rate limiting: Wait if we're at the rate limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()

    // Remove requests older than the rate limit window
    this.rateLimitRequests = this.rateLimitRequests.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
    )

    // If we're at the limit, wait
    if (this.rateLimitRequests.length >= RATE_LIMIT_REQUESTS) {
      const oldestRequest = this.rateLimitRequests[0]
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest) + 100 // Add 100ms buffer

      if (waitTime > 0) {
        logger.debug('Rate limit reached, waiting', { waitTime })
        await this.sleep(waitTime)
        return this.waitForRateLimit() // Recursively check again
      }
    }
  }

  /**
   * Fetch with rate limit tracking
   */
  private async fetchWithRateLimit(url: string): Promise<Response> {
    await this.waitForRateLimit()

    // Track this request
    this.rateLimitRequests.push(Date.now())

    return fetch(url)
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Add a user to track
   */
  addTrackedUser(user: TrackedUser): void {
    // Check if user already exists
    const exists = this.config.trackedUsers.some((u) => u.address.toLowerCase() === user.address.toLowerCase())
    if (exists) {
      logger.warn('User already being tracked', { address: user.address })
      return
    }

    this.config.trackedUsers.push(user)
    logger.info('Added tracked user', { address: user.address, name: user.name })
  }

  /**
   * Remove a tracked user
   */
  removeTrackedUser(address: string): void {
    const index = this.config.trackedUsers.findIndex(
      (u) => u.address.toLowerCase() === address.toLowerCase()
    )
    if (index === -1) {
      logger.warn('User not found in tracked users', { address })
      return
    }

    this.config.trackedUsers.splice(index, 1)
    logger.info('Removed tracked user', { address })
  }

  /**
   * Get tracked users
   */
  getTrackedUsers(): TrackedUser[] {
    return [...this.config.trackedUsers]
  }

  /**
   * Get detected trades
   */
  getDetectedTrades(limit: number = 100): DetectedTrade[] {
    return this.detectedTrades.slice(-limit).reverse()
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean
    enabled: boolean
    trackedUsersCount: number
    detectedTradesCount: number
    lastPollTime: number | null
  } {
    return {
      running: this.isRunning,
      enabled: this.config.enabled,
      trackedUsersCount: this.config.trackedUsers.length,
      detectedTradesCount: this.detectedTrades.length,
      lastPollTime: this.lastPollTime || null,
    }
  }

  /**
   * Get configuration
   */
  getConfig(): CopyTradingConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CopyTradingConfig>): void {
    this.config = { ...this.config, ...updates }
    logger.info('Copy trading config updated', { updates })
  }
}

