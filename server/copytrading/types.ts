/**
 * Copy Trading types
 */

export interface TrackedUser {
  address: string // User Profile Address (0x-prefixed, 40 hex chars)
  name?: string // Optional display name
  pseudonym?: string // User's pseudonym from Polymarket
  bio?: string // User's bio
  profileImage?: string // Profile image URL
}

export type ActivityType = 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION'

export interface PolymarketTrade {
  proxyWallet: string
  side: 'BUY' | 'SELL'
  asset: string
  conditionId: string
  size: number
  price: number
  timestamp: number
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  outcomeIndex?: number
  name?: string
  pseudonym?: string
  bio?: string
  profileImage?: string
  profileImageOptimized?: string
  transactionHash: string
  type?: ActivityType // Activity type from activity endpoint
  usdcSize?: number // USD value of the activity
}

export interface DetectedTrade {
  trade: PolymarketTrade
  trackedUser: TrackedUser
  detectedAt: number
  executed: boolean
  executedAt?: number
  executionError?: string
}

export interface CopyTradingConfig {
  pollIntervalMs: number // How often to poll for new trades
  enabled: boolean
  trackedUsers: TrackedUser[]
  minTradeSize?: number // Minimum trade size to execute (USD) - absolute minimum regardless of scaling
  maxTradeSize?: number // Maximum trade size to execute (USD) - our maximum position size
  recentTradesWindow?: number // Number of recent trades to consider for volume calculation (default: 10)
  minVolumeForScaling?: number // Minimum recent volume required before using proportional scaling (default: 1000)
}

// Market data from Gamma API
export interface MarketData {
  conditionId: string
  closed: boolean | null
  closedTime: string | null
  outcomePrices: string | null // JSON array like "[0.99, 0.01]"
  outcomes: string | null // JSON array like "[\"Yes\", \"No\"]"
  umaResolutionStatus: string | null
  active: boolean | null
}

