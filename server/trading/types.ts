/**
 * Trading types for execution engine
 */

export type TradeSide = 'YES' | 'NO'
export type TradeAction = 'BUY' | 'SELL'
export type ExecutionMode = 'paper' | 'real'
export type OrderStatus = 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled'

export interface TradeOrder {
  orderId: string
  marketId: string
  conditionId: string
  side: TradeSide
  action: TradeAction
  size: number // in USD
  price?: number // limit price (optional, uses market if not set)
  mode: ExecutionMode
  timestamp: number
}

export interface Fill {
  fillId: string
  orderId: string
  price: number
  size: number // in USD
  timestamp: number
}

export interface FillResult {
  orderId: string
  fills: Fill[]
  status: OrderStatus
  totalFilled: number
  averagePrice: number
  timestamp: number
}

export interface Position {
  positionId: string
  marketId: string
  conditionId: string
  yesTokens: number // Amount of YES tokens held
  noTokens: number // Amount of NO tokens held
  yesEntryPrice: number // Average entry price for YES
  noEntryPrice: number // Average entry price for NO
  yesCurrentPrice: number | null // Current market price for YES
  noCurrentPrice: number | null // Current market price for NO
  entryTimestamp: number
  lastUpdate: number
  unrealizedPnL: number // Based on current market prices
  totalEntryCost: number // Total cost to enter position
}

export interface PnLSummary {
  totalRealizedPnL: number
  totalUnrealizedPnL: number
  totalPnL: number
  startingCapital: number
  currentBalance: number
  openPositions: number
  closedPositions: number
}

export interface TradeRecord {
  tradeId: string
  orderId: string
  marketId: string
  conditionId: string
  side: TradeSide
  action: TradeAction
  size: number
  price: number
  status: OrderStatus
  timestamp: number
  mode: ExecutionMode
}

