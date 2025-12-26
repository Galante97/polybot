/**
 * Market data types for Polymarket order book
 */

export interface OrderBookLevel {
  price: string
  size: string
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  timestamp: number
}

export interface OutcomePrices {
  bid: number | null
  ask: number | null
  lastUpdate: number
}

export interface MarketData {
  marketId: string
  conditionId: string
  yesPrices: OutcomePrices
  noPrices: OutcomePrices
  lastUpdate: number
  isStale: boolean
}

// Polymarket WebSocket message types
export interface PolymarketWebSocketMessage {
  type?: string
  channel?: string
  event?: string
  data?: unknown
  payload?: unknown
  asset_id?: string
  bids?: OrderBookLevel[]
  asks?: OrderBookLevel[]
  timestamp?: number
}

export interface PolymarketSubscriptionMessage {
  type: 'market' | 'user'
  assets_ids?: string[] // Note: "assets_ids" not "asset_ids" per API
  markets?: string[]
  auth?: {
    apiKey: string
    secret: string
    passphrase: string
  }
}

export interface PolymarketSubscribeUnsubscribeMessage {
  assets_ids: string[] // Note: "assets_ids" (plural) per API docs
  operation: 'subscribe' | 'unsubscribe'
}

export interface OrderBookUpdate {
  marketId: string
  conditionId: string
  assetId: string // Token ID for YES or NO
  outcome: 'YES' | 'NO'
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  timestamp: number
}
