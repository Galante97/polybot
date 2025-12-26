// API response types

export interface MarketData {
  marketId: string
  conditionId: string
  yesPrices: {
    bid: number | null
    ask: number | null
    lastUpdate: number
  }
  noPrices: {
    bid: number | null
    ask: number | null
    lastUpdate: number
  }
  lastUpdate: number
  isStale: boolean
}

export interface ArbitrageOpportunity {
  marketId: string
  conditionId: string
  yesAsk: number
  noAsk: number
  totalCost: number
  profitMargin: number
  profitAfterFees: number
}

export interface Position {
  marketId: string
  conditionId: string
  yesTokens: number
  noTokens: number
  yesEntryPrice: number
  noEntryPrice: number
  totalEntryCost: number
  yesCurrentPrice: number | null
  noCurrentPrice: number | null
  unrealizedPnL: number
  realizedPnL: number
  totalPnL: number
  lastUpdate: number
}

export interface TradeHistoryEntry {
  orderId: string
  marketId: string
  conditionId: string
  side: 'YES' | 'NO'
  action: 'BUY' | 'SELL'
  size: number
  price: number
  filled: number
  status: 'filled' | 'partial' | 'rejected'
  timestamp: number
}

export interface PnLSummary {
  startingCapital: number
  currentBalance: number
  totalPnL: number
  totalRealizedPnL: number
  totalUnrealizedPnL: number
  openPositions: number
}

export interface BotStatus {
  running: boolean
  enabled: boolean
  trackedMarkets: number
  opportunities: number
}

export interface AppConfig {
  executionMode: 'paper' | 'real'
  capital: number
  exposureCap: number
  minProfitThreshold: number
  maxPositionSize: number
}

// Market Discovery Types
export interface DiscoveredMarket {
  condition_id: string
  question: string
  slug: string
  end_date_iso: string
  image: string
  icon: string
  active: boolean
  liquidity: number
  volume: number
  tokens: Array<{
    token_id: string
    outcome: 'Yes' | 'No'
  }>
}

export interface MarketDiscoveryResult {
  markets: DiscoveredMarket[]
  count: number
}

// Price History Types
export interface PriceHistoryEntry {
  timestamp: number
  marketId: string
  conditionId: string
  yesAsk: number | null
  yesBid: number | null
  noAsk: number | null
  noBid: number | null
  totalCost: number | null
  profitMargin: number | null
}

export interface MarketPriceHistory {
  marketId: string
  conditionId: string
  entries: PriceHistoryEntry[]
  startTime: number
  endTime: number | null
}

export interface PriceHistorySummary {
  summary: Array<{
    marketId: string
    conditionId: string
    latestEntry: PriceHistoryEntry | null
    entryCount: number
    minTotalCost: number | null
    maxTotalCost: number | null
    minProfitMargin: number | null
    maxProfitMargin: number | null
  }>
  count: number
  isTracking: boolean
  startTime: number | null
}
