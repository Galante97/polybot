/**
 * Market Data Service
 * Orchestrates WebSocket connection and market store
 */

import { logger } from '../utils/logger.js'
import { getConfig } from '../config/env.js'
import { MarketStore } from './marketStore.js'
import { PolymarketWebSocketClient, type WebSocketConfig } from './websocketClient.js'

export class MarketDataService {
  private marketStore: MarketStore
  private wsClient: PolymarketWebSocketClient | null = null
  private config: WebSocketConfig
  private isRunning = false
  private subscribedAssetIds: Set<string> = new Set() // Track subscribed asset IDs
  private assetIdToOutcome: Map<string, { conditionId: string; outcome: 'YES' | 'NO' }> = new Map() // Map asset_id to condition_id and outcome

  constructor() {
    const appConfig = getConfig()

    // Initialize market store with configured stale threshold
    this.marketStore = new MarketStore(appConfig.staleDataThresholdMs)

    // WebSocket configuration for CLOB subscriptions
    // Per docs: https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart
    // Base URL: wss://ws-subscriptions-clob.polymarket.com
    // Full URL format: baseUrl/ws/market or baseUrl/ws/user
    const baseUrl = appConfig.polymarketWsUrl || 'wss://ws-subscriptions-clob.polymarket.com'

    this.config = {
      baseUrl,
      reconnectInterval: 5000, // 5 seconds
      maxReconnectAttempts: 10,
      heartbeatInterval: 10000, // 10 seconds (Polymarket requires PING every 10s)
      apiKey: appConfig.polymarketApiKey,
      apiSecret: appConfig.polymarketApiSecret,
      apiPassphrase: appConfig.polymarketApiPassphrase,
      channel: 'market', // Use MARKET channel for order book data
    }

    if (!appConfig.polymarketWsUrl) {
      logger.info('Using default Polymarket CLOB WebSocket base URL: wss://ws-subscriptions-clob.polymarket.com')
    } else {
      logger.info('Using custom WebSocket base URL from config', { baseUrl })
    }

    // Log auth status
    if (this.config.apiKey && this.config.apiSecret && this.config.apiPassphrase) {
      logger.info('CLOB WebSocket authentication configured', {
        hasApiKey: !!this.config.apiKey,
        hasSecret: !!this.config.apiSecret,
        hasPassphrase: !!this.config.apiPassphrase,
      })
    } else {
      logger.warn('CLOB WebSocket authentication not fully configured', {
        note: 'Auth is optional for MARKET channel but required for USER channel',
        hasApiKey: !!this.config.apiKey,
        hasSecret: !!this.config.apiSecret,
        hasPassphrase: !!this.config.apiPassphrase,
      })
    }

    logger.info('Market data service initialized', {
      baseUrl: this.config.baseUrl,
      channel: this.config.channel,
      staleThresholdMs: appConfig.staleDataThresholdMs,
    })
  }

  /**
   * Start the market data service
   * Note: WebSocket connection failures are logged but don't prevent service from starting
   * This allows the server to run in a degraded mode for development/testing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Market data service already running')
      return
    }

    this.isRunning = true
    logger.info('Starting market data service...')

    // Initialize WebSocket client with callback to look up asset outcomes
    this.wsClient = new PolymarketWebSocketClient(
      this.config,
      this.marketStore,
      (assetId: string) => this.getAssetOutcome(assetId)
    )

    try {
      await this.wsClient.connect()
      logger.info('✅ Market data service started successfully - WebSocket connected')

      // TODO: Subscribe to markets
      // This will be implemented when we have market IDs to track
      // For now, we'll wait for Milestone 3 (Arbitrage Detection) to determine which markets to track
    } catch (error) {
      // Log error but don't throw - allow service to run in degraded mode
      logger.error('⚠️  Failed to connect WebSocket - service running in degraded mode', {
        error: error instanceof Error ? error.message : String(error),
        baseUrl: this.config.baseUrl,
        channel: this.config.channel,
        note: 'Server will continue running. Check POLYMARKET_WS_URL and authentication in .env',
      })
      // Service is still considered "running" but without WebSocket connection
      // This allows the API endpoints to work for testing/development
    }
  }

  /**
   * Stop the market data service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    logger.info('Stopping market data service...')
    this.isRunning = false

    if (this.wsClient) {
      this.wsClient.disconnect()
      this.wsClient = null
    }

    logger.info('Market data service stopped')
  }

  /**
   * Get market store instance
   */
  getMarketStore(): MarketStore {
    return this.marketStore
  }

  /**
   * Get WebSocket client
   */
  getWebSocketClient(): PolymarketWebSocketClient | null {
    return this.wsClient
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
    wsConnected: boolean
    wsState: string
    marketCount: number
  } {
    return {
      running: this.isRunning,
      wsConnected: this.wsClient?.isConnected() || false,
      wsState: this.wsClient?.getConnectionState() || 'CLOSED',
      marketCount: this.marketStore.getMarketCount(),
    }
  }

  /**
   * Subscribe to asset IDs (token IDs) for market data
   * See: https://docs.polymarket.com/developers/CLOB/websocket/wss-overview
   * @param assetIds Array of asset IDs to subscribe to
   * @param metadata Optional metadata mapping asset IDs to condition_id and outcome
   */
  subscribeToAssets(
    assetIds: string[],
    metadata?: Array<{ assetId: string; conditionId: string; outcome: 'YES' | 'NO' }>
  ): void {
    if (this.wsClient) {
      this.wsClient.subscribeToAssets(assetIds)
      // Track subscribed asset IDs
      assetIds.forEach((id) => this.subscribedAssetIds.add(id))
      
      // Store metadata mapping if provided
      if (metadata) {
        metadata.forEach((meta) => {
          this.assetIdToOutcome.set(meta.assetId, {
            conditionId: meta.conditionId,
            outcome: meta.outcome,
          })
        })
      }
      
      logger.info('Subscribed to assets', { count: assetIds.length, total: this.subscribedAssetIds.size })
    } else {
      logger.warn('Cannot subscribe: WebSocket client not initialized')
    }
  }

  /**
   * Unsubscribe from asset IDs
   */
  unsubscribeFromAssets(assetIds: string[]): void {
    if (this.wsClient) {
      this.wsClient.unsubscribeFromAssets(assetIds)
      // Remove from tracking
      assetIds.forEach((id) => {
        this.subscribedAssetIds.delete(id)
        this.assetIdToOutcome.delete(id)
      })
      logger.info('Unsubscribed from assets', { count: assetIds.length, total: this.subscribedAssetIds.size })
    } else {
      logger.warn('Cannot unsubscribe: WebSocket client not initialized')
    }
  }

  /**
   * Get list of subscribed asset IDs
   */
  getSubscribedAssetIds(): string[] {
    return Array.from(this.subscribedAssetIds)
  }

  /**
   * Check if an asset ID is subscribed
   */
  isAssetSubscribed(assetId: string): boolean {
    return this.subscribedAssetIds.has(assetId)
  }

  /**
   * Get outcome mapping for an asset ID
   */
  getAssetOutcome(assetId: string): { conditionId: string; outcome: 'YES' | 'NO' } | null {
    return this.assetIdToOutcome.get(assetId) || null
  }
}

