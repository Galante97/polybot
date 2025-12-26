# Polybot

A unified React + Vite + Express application for Polymarket YES/NO arbitrage trading.

## Current Status: Milestone 3 Complete ✅

**Milestone 0: Project Foundation** - Complete ✅
- ✅ Full TypeScript setup (backend + frontend)
- ✅ ESLint + Prettier configuration
- ✅ Environment config handling
- ✅ Process lifecycle management (graceful shutdown)
- ✅ Structured logging framework (Winston)

**Milestone 1: Market Data Ingestion** - Complete ✅
- ✅ WebSocket client for Polymarket CLOB
- ✅ Order book snapshot handling
- ✅ Best bid/ask extraction
- ✅ In-memory market store
- ✅ Stale feed detection (configurable threshold)
- ✅ Market data service with lifecycle management
- ✅ API endpoints for market data access

**Milestone 2: Paper Trade Engine + Dashboard** - Complete ✅
- ✅ Abstract execution engine interface
- ✅ Paper execution engine with fill simulation
- ✅ Position tracking (YES/NO tokens separately)
- ✅ PnL calculation (realized + unrealized)
- ✅ Trade history tracking
- ✅ Full React dashboard with real-time updates
- ✅ Markets panel with arbitrage highlighting
- ✅ Positions panel with PnL display
- ✅ Trade history table
- ✅ PnL chart (Chart.js)
- ✅ Polling-based real-time updates (1s interval)

**Milestone 3: Arbitrage Detection** - Complete ✅
- ✅ Automatic market scanning for arbitrage opportunities
- ✅ Core arbitrage condition (YES + NO < 1 - fees - margin)
- ✅ Profit threshold filtering
- ✅ Market exclusion rules (stale, tracked markets)
- ✅ Opportunity ranking by profit margin
- ✅ Automatic trade execution (dual-leg)
- ✅ Pre-execution validation (balance, position checks)
- ✅ Abort logic for disappearing opportunities
- ✅ Market tracking to prevent duplicate entries
- ✅ Bot start/stop controls in dashboard

**Milestone 3: Arbitrage Detection** - Complete ✅
- ✅ Automatic market scanning for arbitrage opportunities
- ✅ Core arbitrage condition (YES + NO < 1 - fees - margin)
- ✅ Profit threshold filtering
- ✅ Market exclusion rules (stale, tracked markets)
- ✅ Opportunity ranking by profit margin
- ✅ Automatic trade execution (dual-leg)
- ✅ Pre-execution validation (balance, position checks)
- ✅ Abort logic for disappearing opportunities
- ✅ Market tracking to prevent duplicate entries
- ✅ Bot start/stop controls in dashboard

## Project Structure

```
polybot/
├── client/          # React + Vite frontend
│   ├── src/
│   └── index.html
├── server/          # Express backend
│   └── server.js
├── package.json     # Single unified package.json
└── vite.config.js   # Vite configuration
```

## Getting Started

### Quick Start

1. **Install all dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start both frontend and backend** with a single command:
   ```bash
   npm run dev
   ```

That's it! This single command starts:
- **Frontend**: http://localhost:3000 (Vite dev server)
- **Backend**: http://localhost:5000 (Express API)

The output will be color-coded so you can easily distinguish between server and client logs.

### Environment Configuration

The bot uses environment variables for configuration. See `.env.example` for all available options:

- `EXECUTION_MODE`: `paper` or `real` (default: `paper`)
- `CAPITAL`: Starting capital in USD (default: 1000)
- `EXPOSURE_CAP`: Max exposure as percentage of capital (default: 60)
- `MIN_PROFIT_THRESHOLD`: Minimum profit to execute trade (default: 0.01 = 1%)
- `KILL_SWITCH_ENABLED`: Enable automatic kill switch (default: false)

### Run Individually

**Frontend only:**
```bash
npm run dev:client
```

**Backend only:**
```bash
npm run dev:server
```

### Production Build

Build the frontend:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## API Endpoints

### System
- `GET /api/hello` - Test endpoint that returns a greeting
- `GET /api/health` - Health check endpoint
- `GET /api/config` - Get bot configuration (safe values only)
- `GET /api/market-data/status` - Get market data service status

### Market Data
- `GET /api/markets` - Get all tracked markets
- `GET /api/markets/:marketId` - Get specific market data
- `GET /api/markets/opportunities/arbitrage?feeBuffer=0` - Get arbitrage opportunities

### Trading (Paper)
- `POST /api/trades/execute` - Execute a paper trade
- `GET /api/positions` - Get all open positions
- `GET /api/positions/:marketId` - Get specific position
- `POST /api/positions/:marketId/close` - Close a position
- `POST /api/positions/flatten` - Close all positions
- `GET /api/trades?limit=100` - Get trade history
- `GET /api/pnl` - Get PnL summary
- `GET /api/balance` - Get current balance

### Arbitrage
- `GET /api/arbitrage/status` - Get arbitrage service status
- `GET /api/arbitrage/opportunities` - Get current opportunities
- `GET /api/arbitrage/config` - Get arbitrage configuration
- `POST /api/arbitrage/start` - Start arbitrage detection
- `POST /api/arbitrage/stop` - Stop arbitrage detection
- `POST /api/arbitrage/config` - Update arbitrage configuration

## Technologies

- **Frontend**: React 18, TypeScript, Vite 5
- **Backend**: Express.js, TypeScript
- **Logging**: Winston (structured logging with file rotation)
- **Package Management**: Single unified npm package.json

## Project Structure

```
polybot/
├── client/              # React + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   └── index.html
├── server/              # TypeScript backend
│   ├── config/         # Configuration management
│   ├── market/         # Market data ingestion
│   │   ├── types.ts    # Market data types
│   │   ├── marketStore.ts      # In-memory market store
│   │   ├── websocketClient.ts  # WebSocket client
│   │   └── marketDataService.ts # Market data service
│   ├── utils/          # Utilities (logger, lifecycle)
│   └── server.ts        # Main server entry point
├── logs/               # Application logs (auto-created)
├── data/               # SQLite database (will be created)
├── package.json        # Single unified package.json
├── tsconfig.json       # TypeScript configuration
└── vite.config.ts      # Vite configuration (TypeScript)
```

## Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run lint` - Lint TypeScript files (client + server)
- `npm run format` - Format code with Prettier
- `npm run build` - Build frontend for production
- `npm start` - Start production server

## Next Milestones

- **Milestone 4**: Risk Management - Ready to start! 🚀
- **Milestone 5**: Persistence Layer (SQLite)

## Future Enhancements

### Early Exit Strategy
- **Auto-close on profit threshold**: Automatically close arbitrage positions when `current_value - entry_cost > profit_threshold`
- **Configurable profit target**: Allow setting profit percentage (e.g., 5%) to exit before market resolution
- **Rationale**: While holding to resolution guarantees profit, early exit can improve capital efficiency and reduce exposure time
- **Implementation**: Add `AUTO_EXIT_PROFIT_THRESHOLD` config option and monitoring logic in position manager

## Notes

### Milestone 1 Implementation Notes

The WebSocket client is set up with:
- Automatic reconnection with exponential backoff
- Heartbeat/ping-pong to keep connection alive
- Stale data detection (configurable threshold)
- Best bid/ask extraction from order book snapshots
- **Resilient error handling**: Server continues running even if WebSocket connection fails

**Important Notes**:
1. **WebSocket URL**: Using CLOB subscriptions endpoint: `wss://ws-subscriptions-clob.polymarket.com/ws/market`. The full URL is constructed as `baseUrl/ws/market`. You can override the base URL with `POLYMARKET_WS_URL` if needed. See [WSS Quickstart](https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart).

2. **Authentication**: For MARKET channel, authentication is optional. For USER channel (order/trade updates), all three credentials are required. Set `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, and `POLYMARKET_API_PASSPHRASE` in `.env`. See [WSS Authentication docs](https://docs.polymarket.com/developers/CLOB/websocket/wss-auth).

3. **Subscription**: The client automatically subscribes to the MARKET channel on connection with an empty `assets_ids` array. Use `subscribeToAssets(assetIds)` to subscribe to specific token IDs. Asset IDs correspond to YES/NO tokens for each market. See [Market Channel docs](https://docs.polymarket.com/developers/CLOB/websocket/market-channel).

4. **Message Format**: Handles two message types from Market Channel:
   - `event_type: "book"` - Full order book with bids/asks arrays
   - `event_type: "price_change"` - Price updates with best_bid/best_ask
   Messages include `asset_id`, `market` (condition_id), `bids`, `asks`, and `timestamp`.

5. **Heartbeat**: Sends "PING" message every 10 seconds to keep connection alive (per Polymarket requirements).

6. **Asset ID Mapping**: Currently uses asset_id directly. You may need to implement a mapping from asset_id to condition_id and outcome (YES/NO) using Polymarket's market metadata API (Gamma API).

7. **Degraded Mode**: If the WebSocket connection fails, the server will log warnings but continue running. This allows development and testing of other components while the WebSocket endpoint is being configured.

