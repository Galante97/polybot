import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { getConfig } from './config/env.js'
import { logger } from './utils/logger.js'
import { lifecycle } from './utils/lifecycle.js'
import { MarketDataService } from './market/marketDataService.js'
import { MarketDiscoveryService } from './market/marketDiscovery.js'
import { PaperExecutionEngine } from './trading/paperExecutionEngine.js'
import { CopyTradingService } from './copytrading/copyTradingService.js'
import { v4 as uuidv4 } from 'uuid'
import type { TradeOrder } from './trading/types.js'
import { initializeDatabase, closeDatabase } from './database/client.js'
import path from 'path';
import { fileURLToPath } from 'url';

const config = getConfig()
const app: Express = express()

// Initialize services
const marketDataService = new MarketDataService()
const marketDiscoveryService = new MarketDiscoveryService()
let executionEngine: PaperExecutionEngine | null = null
let copyTradingService: CopyTradingService | null = null

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging middleware (disabled for now)
// app.use((req: Request, res: Response, next: NextFunction) => {
//   logger.debug('Incoming request', {
//     method: req.method,
//     path: req.path,
//     ip: req.ip,
//   })
//   next()
// })


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const topLevelPath = __dirname.replace('/server', '');

app.use(express.static(topLevelPath));


// API Routes
app.get('/api/hello', (req: Request, res: Response) => {
  res.json({
    message: 'Hello from Polybot API! 🚀',
    timestamp: new Date().toISOString(),
    config: {
      executionMode: config.executionMode,
      nodeEnv: config.nodeEnv,
    },
  })
})

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    executionMode: config.executionMode,
    killSwitchEnabled: config.killSwitchEnabled,
  })
})

app.get('/api/config', (req: Request, res: Response) => {
  // Return safe config (no sensitive data)
  res.json({
    executionMode: config.executionMode,
    capital: config.capital,
    exposureCap: config.exposureCap,
    minProfitThreshold: config.minProfitThreshold,
    maxPositionSize: config.maxPositionSize,
    killSwitchEnabled: config.killSwitchEnabled,
  })
})

// Market Data API Routes
// Note: Specific routes must come before parameterized routes
app.get('/api/markets/opportunities/arbitrage', (req: Request, res: Response) => {
  const marketStore = marketDataService.getMarketStore()
  const feeBuffer = parseFloat(req.query.feeBuffer as string) || 0
  const opportunities = marketStore.getArbitrageOpportunities(feeBuffer)
  res.json({
    opportunities,
    count: opportunities.length,
    feeBuffer,
  })
})

// Market Discovery endpoints removed - discovery UI has been removed

app.get('/api/markets', (req: Request, res: Response) => {
  const marketStore = marketDataService.getMarketStore()
  const markets = marketStore.getAllMarkets()
  res.json({
    markets,
    count: markets.length,
  })
})

app.get('/api/markets/:marketId', (req: Request, res: Response) => {
  const { marketId } = req.params
  const marketStore = marketDataService.getMarketStore()
  const market = marketStore.getMarket(marketId)

  if (!market) {
    return res.status(404).json({
      error: 'Market not found',
      marketId,
    })
  }

  res.json(market)
})

app.get('/api/market-data/status', (req: Request, res: Response) => {
  const status = marketDataService.getStatus()
  res.json(status)
})

app.post('/api/market-data/subscribe', (req: Request, res: Response) => {
  try {
    const { assetIds } = req.body

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'assetIds must be a non-empty array of asset ID strings',
      })
    }

    // Validate all items are strings
    if (!assetIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'All assetIds must be strings',
      })
    }

    marketDataService.subscribeToAssets(assetIds)
    res.json({
      message: 'Subscribed to assets',
      assetIds,
      count: assetIds.length,
    })
  } catch (error) {
    logger.error('Subscription error', { error })
    res.status(500).json({
      error: 'Failed to subscribe to assets',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.post('/api/market-data/unsubscribe', (req: Request, res: Response) => {
  try {
    const { assetIds } = req.body

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'assetIds must be a non-empty array of asset ID strings',
      })
    }

    marketDataService.unsubscribeFromAssets(assetIds)
    res.json({
      message: 'Unsubscribed from assets',
      assetIds,
      count: assetIds.length,
    })
  } catch (error) {
    logger.error('Unsubscription error', { error })
    res.status(500).json({
      error: 'Failed to unsubscribe from assets',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/market-data/subscriptions', (req: Request, res: Response) => {
  const subscribedAssetIds = marketDataService.getSubscribedAssetIds()
  res.json({
    subscribedAssetIds,
    count: subscribedAssetIds.length,
  })
})

// Price History API Routes - Removed (feature deprecated)

app.post('/api/markets/:conditionId/subscribe', async (req: Request, res: Response) => {
  try {
    const { conditionId } = req.params

    // Fetch market details to get asset IDs
    const markets = await marketDiscoveryService.fetchMarkets(1000, 0)
    const market = markets.markets.find((m) => m.condition_id === conditionId)

    if (!market) {
      return res.status(404).json({ error: 'Market not found', conditionId })
    }

    const { yesAssetId, noAssetId } = marketDiscoveryService.getAssetIds(market)

    if (!yesAssetId || !noAssetId) {
      logger.warn('Market missing asset IDs', {
        conditionId,
        tokenCount: market.tokens?.length || 0,
        tokens: market.tokens?.map((t) => ({ hasTokenId: !!t.token_id, outcome: t.outcome })),
      })
      return res.status(400).json({
        error: 'Market missing asset IDs',
        conditionId,
        message: 'Market must have at least 2 tokens with valid token_ids',
      })
    }

    // Subscribe to both YES and NO tokens with metadata
    marketDataService.subscribeToAssets([yesAssetId, noAssetId], [
      { assetId: yesAssetId, conditionId, outcome: 'YES' },
      { assetId: noAssetId, conditionId, outcome: 'NO' },
    ])

    res.json({
      message: 'Subscribed to market',
      conditionId,
      market: {
        conditionId: market.condition_id,
        question: market.question,
        slug: market.slug,
      },
      assetIds: {
        yes: yesAssetId,
        no: noAssetId,
      },
    })
  } catch (error) {
    logger.error('Market subscription error', { error })
    res.status(500).json({
      error: 'Failed to subscribe to market',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.post('/api/markets/:conditionId/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { conditionId } = req.params

    // Fetch market details to get asset IDs
    const markets = await marketDiscoveryService.fetchMarkets(1000, 0)
    const market = markets.markets.find((m) => m.condition_id === conditionId)

    if (!market) {
      return res.status(404).json({ error: 'Market not found', conditionId })
    }

    const { yesAssetId, noAssetId } = marketDiscoveryService.getAssetIds(market)

    if (!yesAssetId || !noAssetId) {
      logger.warn('Market missing asset IDs on unsubscribe', {
        conditionId,
        tokenCount: market.tokens?.length || 0,
      })
      return res.status(400).json({
        error: 'Market missing asset IDs',
        conditionId,
        message: 'Market must have at least 2 tokens with valid token_ids',
      })
    }

    // Unsubscribe from both YES and NO tokens
    marketDataService.unsubscribeFromAssets([yesAssetId, noAssetId])

    res.json({
      message: 'Unsubscribed from market',
      conditionId,
      assetIds: {
        yes: yesAssetId,
        no: noAssetId,
      },
    })
  } catch (error) {
    logger.error('Market unsubscription error', { error })
    res.status(500).json({
      error: 'Failed to unsubscribe from market',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

// Trading API Routes
app.post('/api/trades/execute', async (req: Request, res: Response) => {
  try {
    if (!executionEngine) {
      return res.status(503).json({ error: 'Execution engine not initialized' })
    }

    const { marketId, conditionId, side, action, size, price } = req.body

    if (!marketId || !conditionId || !side || !action || !size) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const order: TradeOrder = {
      orderId: uuidv4(),
      marketId,
      conditionId,
      side,
      action,
      size: parseFloat(size),
      price: price ? parseFloat(price) : undefined,
      mode: 'paper',
      timestamp: Date.now(),
    }

    const result = await executionEngine.executeTrade(order)
    res.json(result)
  } catch (error) {
    logger.error('Trade execution error', { error })
    res.status(500).json({
      error: 'Trade execution failed',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/positions', (req: Request, res: Response) => {
  if (!executionEngine) {
    return res.status(503).json({ error: 'Execution engine not initialized' })
  }

  const positions = executionEngine.getPositions()
  res.json({ positions, count: positions.length })
})

app.get('/api/positions/:marketId', (req: Request, res: Response) => {
  if (!executionEngine) {
    return res.status(503).json({ error: 'Execution engine not initialized' })
  }

  const { marketId } = req.params
  const position = executionEngine.getPosition(marketId)

  if (!position) {
    return res.status(404).json({ error: 'Position not found', marketId })
  }

  res.json(position)
})

app.post('/api/positions/:marketId/close', async (req: Request, res: Response) => {
  try {
    if (!executionEngine) {
      return res.status(503).json({ error: 'Execution engine not initialized' })
    }

    const { marketId } = req.params
    const results = await executionEngine.closePosition(marketId)

      // Copy trading doesn't need to track market states like arbitrage did

    res.json({ results, count: results.length })
  } catch (error) {
    logger.error('Position close error', { error })
    res.status(500).json({
      error: 'Failed to close position',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.post('/api/positions/flatten', async (req: Request, res: Response) => {
  try {
    if (!executionEngine) {
      return res.status(503).json({ error: 'Execution engine not initialized' })
    }

    const results = await executionEngine.closeAllPositions()

    // Copy trading doesn't need to track market states like arbitrage did

    res.json({ results, count: results.length })
  } catch (error) {
    logger.error('Flatten positions error', { error })
    res.status(500).json({
      error: 'Failed to flatten positions',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/trades', (req: Request, res: Response) => {
  if (!executionEngine) {
    return res.status(503).json({ error: 'Execution engine not initialized' })
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100
  const trades = executionEngine.getTradeHistory(limit)
  res.json({ trades, count: trades.length })
})

app.get('/api/pnl', (req: Request, res: Response) => {
  if (!executionEngine) {
    return res.status(503).json({ error: 'Execution engine not initialized' })
  }

  const pnl = executionEngine.getPnL()
  res.json(pnl)
})

app.get('/api/balance', (req: Request, res: Response) => {
  if (!executionEngine) {
    return res.status(503).json({ error: 'Execution engine not initialized' })
  }

  const balance = executionEngine.getBalance()
  res.json({ balance })
})

// Copy Trading API Routes
app.get('/api/copy-trading/status', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const status = copyTradingService.getStatus()
  res.json(status)
})

app.get('/api/copy-trading/tracked-users', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const users = copyTradingService.getTrackedUsers()
  res.json({ users, count: users.length })
})

app.get('/api/copy-trading/detected-trades', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100
  const trades = copyTradingService.getDetectedTrades(limit)
  res.json({ trades, count: trades.length })
})

app.get('/api/copy-trading/config', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const config = copyTradingService.getConfig()
  res.json(config)
})

app.post('/api/copy-trading/start', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  copyTradingService.start()
  res.json({ message: 'Copy trading service started', status: copyTradingService.getStatus() })
})

app.post('/api/copy-trading/stop', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  copyTradingService.stop()
  res.json({ message: 'Copy trading service stopped', status: copyTradingService.getStatus() })
})

app.post('/api/copy-trading/config', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const updates = req.body

  // Validate updates
  const allowedKeys = [
    'pollIntervalMs',
    'minTradeSize',
    'maxTradeSize',
    'recentTradesWindow',
    'minVolumeForScaling',
  ]

  const validUpdates: Partial<ReturnType<typeof copyTradingService.getConfig>> = {}
  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      const typedKey = key as keyof ReturnType<typeof copyTradingService.getConfig>
      validUpdates[typedKey] = updates[key]
    }
  }

  copyTradingService.updateConfig(validUpdates)
  res.json({ message: 'Config updated', config: copyTradingService.getConfig() })
})

app.post('/api/copy-trading/tracked-users', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const { address, name } = req.body

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid address' })
  }

  // Validate address format (0x-prefixed, 42 chars total)
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid address format (must be 0x-prefixed, 40 hex chars)' })
  }

  copyTradingService.addTrackedUser({ address, name })
  res.json({ message: 'User added', trackedUsers: copyTradingService.getTrackedUsers() })
})

app.delete('/api/copy-trading/tracked-users/:address', (req: Request, res: Response) => {
  if (!copyTradingService) {
    return res.status(503).json({ error: 'Copy trading service not initialized' })
  }

  const { address } = req.params

  copyTradingService.removeTrackedUser(address)
  res.json({ message: 'User removed', trackedUsers: copyTradingService.getTrackedUsers() })
})

// All other routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(topLevelPath, 'index.html'));
});


// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  })
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message,
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  })
})

// Start server
const server = app.listen(config.port, async () => {
  logger.info('🚀 Polybot server started', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    executionMode: config.executionMode,
  })
  logger.info(`📡 API available at http://localhost:${config.port}/api`)

  // Initialize database FIRST before any services
  try {
    initializeDatabase()
    logger.info('✅ Database initialized successfully')
  } catch (error) {
    logger.error('❌ Database initialization failed', { error })
    process.exit(1) // Cannot run without database
  }

  // Start market data service (non-blocking - server continues even if WebSocket fails)
  marketDataService.start().catch((error) => {
    logger.error('Market data service startup error (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    })
    // Server continues running - WebSocket connection is optional for development
  })

  // Initialize execution engine after market data service
  // Wait a bit for market store to be ready
  setTimeout(() => {
    const marketStore = marketDataService.getMarketStore()
    executionEngine = new PaperExecutionEngine(marketStore)
    logger.info('✅ Paper execution engine initialized')

    // Initialize copy trading service
    if (executionEngine) {
      // Start with empty list - users can be added via API
      copyTradingService = new CopyTradingService(executionEngine, [])
      logger.info('✅ Copy trading service initialized')
    }

    // Price history tracking removed
  }, 1000)
})

// Register shutdown handler
lifecycle.registerShutdownHandler(async () => {
  logger.info('Shutting down services...')

  // Stop copy trading service first
  if (copyTradingService) {
    try {
      copyTradingService.stop()
    } catch (error) {
      logger.error('Error stopping copy trading service', { error })
    }
  }

  // Stop market data service
  try {
    await marketDataService.stop()
  } catch (error) {
    logger.error('Error stopping market data service', { error })
  }

  // Close database connection
  try {
    closeDatabase()
    logger.info('Database connection closed')
  } catch (error) {
    logger.error('Error closing database', { error })
  }

  // Then close HTTP server
  return new Promise<void>((resolve) => {
    server.close(() => {
      logger.info('HTTP server closed')
      resolve()
    })
  })
})

