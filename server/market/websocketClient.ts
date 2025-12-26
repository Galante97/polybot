/**
 * WebSocket client for Polymarket CLOB
 * Handles connection, subscription, and message parsing
 */

import WebSocket from 'ws'
import { logger } from '../utils/logger.js'
import { MarketStore } from './marketStore.js'
import {
  OrderBookUpdate,
  PolymarketWebSocketMessage,
  PolymarketSubscriptionMessage,
  PolymarketSubscribeUnsubscribeMessage,
} from './types.js'

export interface WebSocketConfig {
  baseUrl: string // Base URL without /ws/market or /ws/user
  reconnectInterval: number
  maxReconnectAttempts: number
  heartbeatInterval: number
  // CLOB Authentication (required for USER channel, optional for MARKET)
  apiKey?: string
  apiSecret?: string
  apiPassphrase?: string
  channel: 'market' | 'user' // Which channel to connect to
}

export class PolymarketWebSocketClient {
  private ws: WebSocket | null = null
  private config: WebSocketConfig
  private marketStore: MarketStore
  private getAssetOutcome: (assetId: string) => { conditionId: string; outcome: 'YES' | 'NO' } | null
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isConnecting = false
  private isShuttingDown = false

  constructor(
    config: WebSocketConfig,
    marketStore: MarketStore,
    getAssetOutcome?: (assetId: string) => { conditionId: string; outcome: 'YES' | 'NO' } | null
  ) {
    this.config = config
    this.marketStore = marketStore
    this.getAssetOutcome = getAssetOutcome || (() => null)
  }

  /**
   * Connect to Polymarket WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('WebSocket already connected or connecting')
      return
    }

    if (this.isShuttingDown) {
      logger.warn('Cannot connect: shutdown in progress')
      return
    }

    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        // CLOB WebSocket URL format: baseUrl/ws/channel
        // Per docs: https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
        const wsUrl = `${this.config.baseUrl}/ws/${this.config.channel}`
        logger.info('Connecting to Polymarket CLOB WebSocket', {
          url: wsUrl,
          channel: this.config.channel,
        })

        this.ws = new WebSocket(wsUrl)

        this.ws.on('open', () => {
          logger.info('WebSocket connected to Polymarket')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.startHeartbeat()
          
          // Send initial subscription message per Polymarket API
          // For now, we'll subscribe to MARKET channel (can be empty initially)
          // Asset IDs will be added later when we know which markets to track
          this.sendInitialSubscription()
          
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data)
        })

        this.ws.on('error', (error: Error) => {
          const errorMessage = error.message || String(error)
          logger.error('WebSocket connection error', {
            error: errorMessage,
            url: `${this.config.baseUrl}/ws/${this.config.channel}`,
            attempt: this.reconnectAttempts + 1,
          })
          this.isConnecting = false
          if (this.reconnectAttempts === 0) {
            reject(
              new Error(
                `WebSocket connection failed: ${errorMessage}. Check POLYMARKET_WS_URL and authentication in .env`
              )
            )
          }
        })

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.warn('WebSocket closed', {
            code,
            reason: reason.toString(),
            reconnectAttempts: this.reconnectAttempts,
          })
          this.isConnecting = false
          this.stopHeartbeat()

          if (!this.isShuttingDown) {
            this.scheduleReconnect()
          }
        })

        this.ws.on('ping', () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.pong()
          }
        })
      } catch (error) {
        this.isConnecting = false
        logger.error('Failed to create WebSocket connection', { error })
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.isShuttingDown = true
    this.stopHeartbeat()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client shutdown')
      this.ws = null
    }

    logger.info('WebSocket disconnected')
  }

  /**
   * Send initial subscription message per Polymarket CLOB API format
   * See: https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
   */
  private sendInitialSubscription(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    let subscriptionMessage: PolymarketSubscriptionMessage

    if (this.config.channel === 'market') {
      // MARKET channel: {"assets_ids": [...], "type": "market"}
      // Auth is optional for MARKET channel
      subscriptionMessage = {
        type: 'market',
        assets_ids: [], // Empty initially - will subscribe to specific assets later
      }

      // Add auth if provided (optional for market channel)
      if (this.config.apiKey && this.config.apiSecret && this.config.apiPassphrase) {
        subscriptionMessage.auth = {
          apiKey: this.config.apiKey,
          secret: this.config.apiSecret,
          passphrase: this.config.apiPassphrase,
        }
      }
    } else {
      // USER channel: {"markets": [...], "type": "user", "auth": {...}}
      // Auth is required for USER channel
      if (!this.config.apiKey || !this.config.apiSecret || !this.config.apiPassphrase) {
        logger.error('USER channel requires authentication (apiKey, secret, passphrase)')
        return
      }

      subscriptionMessage = {
        type: 'user',
        markets: [], // Empty initially - will subscribe to specific markets later
        auth: {
          apiKey: this.config.apiKey,
          secret: this.config.apiSecret,
          passphrase: this.config.apiPassphrase,
        },
      }
    }

    try {
      this.ws.send(JSON.stringify(subscriptionMessage))
      logger.info(`Sent ${this.config.channel.toUpperCase()} channel subscription`, {
        hasAuth: !!subscriptionMessage.auth,
        assetCount: subscriptionMessage.assets_ids?.length || 0,
        marketCount: subscriptionMessage.markets?.length || 0,
      })
    } catch (error) {
      logger.error('Failed to send subscription message', { error })
    }
  }

  /**
   * Subscribe to specific asset IDs (token IDs)
   * Per Polymarket API: https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
   * Note: Only works for MARKET channel
   */
  subscribeToAssets(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot subscribe: WebSocket not connected')
      return
    }

    if (this.config.channel !== 'market') {
      logger.warn('subscribeToAssets only works for MARKET channel')
      return
    }

    // Per Polymarket CLOB docs, subscription messages use this format:
    // { "assets_ids": [...], "operation": "subscribe" }
    const message: PolymarketSubscribeUnsubscribeMessage = {
      assets_ids: assetIds, // Note: "assets_ids" not "asset_ids"
      operation: 'subscribe',
    }

    try {
      const messageStr = JSON.stringify(message)
      this.ws.send(messageStr)
      logger.info('📤 Sent subscription message to WebSocket', {
        assetIds,
        count: assetIds.length,
        message: messageStr,
      })
    } catch (error) {
      logger.error('Failed to subscribe to assets', { error, assetIds })
    }
  }

  /**
   * Unsubscribe from specific asset IDs
   * Note: Only works for MARKET channel
   */
  unsubscribeFromAssets(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot unsubscribe: WebSocket not connected')
      return
    }

    if (this.config.channel !== 'market') {
      logger.warn('unsubscribeFromAssets only works for MARKET channel')
      return
    }

    const message: PolymarketSubscribeUnsubscribeMessage = {
      assets_ids: assetIds, // Note: "assets_ids" not "asset_ids"
      operation: 'unsubscribe',
    }

    try {
      this.ws.send(JSON.stringify(message))
      logger.info('Unsubscribed from assets', { assetIds, count: assetIds.length })
    } catch (error) {
      logger.error('Failed to unsubscribe from assets', { error, assetIds })
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    const messageStr = data.toString()

    // Handle plain text PONG responses (heartbeat)
    if (messageStr === 'PONG') {
      // Silently handle PONG - it's just a heartbeat response
      return
    }

    try {
      const parsed = JSON.parse(messageStr)
      
      // Handle array messages (batch updates or subscription confirmations)
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          // Empty array - might be a keepalive or subscription confirmation
          logger.debug('Received empty array message (likely keepalive/subscription confirmation)')
          return
        }
        // Process each message in the array
        logger.debug('Processing batch message array', { count: parsed.length })
        for (const msg of parsed) {
          this.processMessage(msg as PolymarketWebSocketMessage)
        }
        return
      }

      // Handle object messages
      logger.debug('📥 Received WebSocket message', {
        keys: Object.keys(parsed),
        preview: JSON.stringify(parsed).substring(0, 300),
      })
      const message = parsed as PolymarketWebSocketMessage
      this.processMessage(message)
    } catch (error) {
      logger.error('Failed to parse WebSocket message', {
        error,
        data: messageStr.substring(0, 200),
      })
    }
  }

  /**
   * Process parsed WebSocket message
   * Per Polymarket Market Channel docs: https://docs.polymarket.com/developers/CLOB/websocket/market-channel
   * Message types: "book", "price_change", etc.
   */
  private processMessage(message: PolymarketWebSocketMessage): void {
    // Polymarket Market Channel uses 'event_type' field
    const eventType = (message as { event_type?: string }).event_type || message.type

    switch (eventType) {
      case 'book':
        // Order book snapshot/update
        this.handleOrderBookMessage(message)
        break
      case 'price_change':
        // Price change event - we can extract best bid/ask from this
        this.handlePriceChangeMessage(message)
        break
      case 'pong':
      case 'heartbeat':
      case 'ping':
        // Heartbeat response
        break
      case 'error':
        logger.error('WebSocket error message', { message })
        break
      case 'subscribed':
      case 'unsubscribed':
        logger.info('Subscription confirmation received', {
          eventType,
          message: JSON.stringify(message).substring(0, 500),
        })
        break
      default:
        // If message has bids/asks directly, it's likely an order book update
        if (message.bids || message.asks) {
          this.handleOrderBookMessage(message)
        } else if (eventType === 'subscribed' || eventType === 'unsubscribed') {
          // Subscription confirmation - log but don't process
          logger.debug('Subscription confirmation', {
            eventType,
            message: message as unknown,
          })
        } else {
          // Log full message for debugging (but reduce verbosity for empty arrays)
          const messageStr = JSON.stringify(message)
          if (messageStr !== '[]' && messageStr !== '{}') {
            logger.debug('Unhandled message type', {
              type: message.type,
              eventType,
              hasBids: !!message.bids,
              hasAsks: !!message.asks,
              messageKeys: Object.keys(message),
              messagePreview: messageStr.substring(0, 200),
            })
          }
        }
    }
  }

  /**
   * Handle order book messages from Polymarket
   * Message format: { asset_id, bids: [{price, size}], asks: [{price, size}] }
   * Asset ID corresponds to a token (YES or NO outcome)
   */
  private handleOrderBookMessage(message: PolymarketWebSocketMessage): void {
    try {
      // Per Polymarket Market Channel docs: message has event_type, asset_id, market, bids, asks
      const msg = message as {
        event_type?: string
        asset_id?: string
        market?: string
        bids?: Array<{ price: string; size: string }>
        asks?: Array<{ price: string; size: string }>
        timestamp?: string | number
      }

      const assetId = msg.asset_id
      const marketId = msg.market // This is the condition_id

      if (!assetId) {
        logger.warn('Order book message missing asset_id', { message })
        return
      }

      const bids = msg.bids || []
      const asks = msg.asks || []

      if (bids.length === 0 && asks.length === 0) {
        logger.debug('Order book message has no bids or asks', { assetId, marketId })
        return
      }

      // Parse timestamp (can be string or number)
      let timestamp: number
      if (typeof msg.timestamp === 'string') {
        timestamp = parseInt(msg.timestamp, 10)
      } else {
        timestamp = msg.timestamp || Date.now()
      }

      // Determine outcome (YES/NO) from asset metadata
      let outcome: 'YES' | 'NO' = 'YES' // Default fallback
      let finalMarketId = marketId || ''
      const assetMetadata = this.getAssetOutcome(assetId)
      if (assetMetadata) {
        outcome = assetMetadata.outcome
        // Use the condition_id from metadata if marketId wasn't in message
        if (!finalMarketId && assetMetadata.conditionId) {
          finalMarketId = assetMetadata.conditionId
        }
      } else {
        // Fallback: try to infer from asset_id (placeholder)
        outcome = this.inferOutcomeFromAssetId(assetId, finalMarketId)
      }

      // Create update
      const update: OrderBookUpdate = {
        marketId: finalMarketId || assetId, // condition_id or fallback to assetId
        conditionId: finalMarketId || assetId, // Same as marketId
        assetId: assetId,
        outcome,
        bids: bids,
        asks: asks,
        timestamp,
      }

      logger.info('📊 Processing order book update', {
        assetId,
        marketId,
        bidCount: bids.length,
        askCount: asks.length,
        bestBid: bids[0]?.price,
        bestAsk: asks[0]?.price,
        outcome,
      })

      // Update market store
      this.marketStore.updateOrderBook(update)
    } catch (error) {
      logger.error('Failed to process order book message', { error, message })
    }
  }

  /**
   * Handle price change messages from Polymarket Market Channel
   * Per docs: https://docs.polymarket.com/developers/CLOB/websocket/market-channel
   */
  private handlePriceChangeMessage(message: PolymarketWebSocketMessage): void {
    try {
      const msg = message as {
        event_type?: string
        market?: string
        price_changes?: Array<{
          asset_id: string
          price: string
          size: string
          side: 'BUY' | 'SELL'
          best_bid?: string
          best_ask?: string
        }>
        timestamp?: string | number
      }

      if (!msg.price_changes || msg.price_changes.length === 0) {
        return
      }

      for (const priceChange of msg.price_changes) {
        const assetId = priceChange.asset_id
        const marketId = msg.market || ''
        const bestBid = priceChange.best_bid
        const bestAsk = priceChange.best_ask

        if (!bestBid && !bestAsk) {
          continue
        }

        const bids = bestBid ? [{ price: bestBid, size: priceChange.size }] : []
        const asks = bestAsk ? [{ price: bestAsk, size: priceChange.size }] : []

        let timestamp: number
        if (typeof msg.timestamp === 'string') {
          timestamp = parseInt(msg.timestamp, 10)
        } else {
          timestamp = msg.timestamp || Date.now()
        }

        // Determine outcome from asset metadata
        let outcome: 'YES' | 'NO' = 'YES'
        let finalMarketId = marketId || ''
        const assetMetadata = this.getAssetOutcome(assetId)
        if (assetMetadata) {
          outcome = assetMetadata.outcome
          if (!finalMarketId && assetMetadata.conditionId) {
            finalMarketId = assetMetadata.conditionId
          }
        } else {
          outcome = this.inferOutcomeFromAssetId(assetId, finalMarketId)
        }

        const update: OrderBookUpdate = {
          marketId: finalMarketId || assetId,
          conditionId: finalMarketId || assetId,
          assetId: assetId,
          outcome,
          bids: bids,
          asks: asks,
          timestamp,
        }

        logger.debug('Processing price change', {
          assetId,
          marketId,
          bestBid,
          bestAsk,
          side: priceChange.side,
        })

        this.marketStore.updateOrderBook(update)
      }
    } catch (error) {
      logger.error('Failed to process price change message', { error, message })
    }
  }

  /**
   * Infer outcome (YES/NO) from asset_id
   * Uses market metadata if available, otherwise defaults to YES
   * The market data service should provide metadata when subscribing
   */
  private inferOutcomeFromAssetId(assetId: string, marketId?: string): 'YES' | 'NO' {
    // Try to get outcome from market data service if available
    // This requires passing the service reference, which we'll do via a callback
    // For now, we'll use a simple heuristic: if we have market metadata, use it
    // Otherwise default to YES (will be updated when metadata is available)
    
    // TODO: Get outcome from market data service metadata
    // For now, we'll need to pass this information when processing messages
    return 'YES'
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown) {
      return
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
      })
      return
    }

    this.reconnectAttempts++
    const delay = this.config.reconnectInterval * this.reconnectAttempts

    logger.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    })

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnection failed', { error, attempt: this.reconnectAttempts })
      })
    }, delay)
  }

  /**
   * Start heartbeat to keep connection alive
   * Per Polymarket docs: Send "PING" message every 10 seconds
   * See: https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    // Polymarket requires "PING" text message every 10 seconds
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('PING')
        } catch (error) {
          logger.error('Failed to send PING', { error })
        }
      }
    }, 10000) // 10 seconds as per Polymarket docs
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get connection state
   */
  getConnectionState(): string {
    if (!this.ws) return 'CLOSED'
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING'
      case WebSocket.OPEN:
        return 'OPEN'
      case WebSocket.CLOSING:
        return 'CLOSING'
      case WebSocket.CLOSED:
        return 'CLOSED'
      default:
        return 'UNKNOWN'
    }
  }
}

