# How to Find and Subscribe to Asset IDs

## What are Asset IDs?

Each Polymarket market has two outcome tokens:
- **YES token** - One asset ID
- **NO token** - Another asset ID

You need to subscribe to **both** asset IDs for a market to get complete order book data.

## Where to Find Asset IDs

### Option 1: Polymarket CLOB API (Recommended)

Use the Polymarket CLOB REST API to get market information:

```bash
# Get all markets
curl "https://clob.polymarket.com/markets"

# Get specific market by condition ID
curl "https://clob.polymarket.com/markets?condition_id=<condition_id>"
```

The response includes `tokens` array with asset IDs:
```json
{
  "tokens": [
    {
      "token_id": "0x...",  // This is the asset ID for YES
      "outcome": "Yes"
    },
    {
      "token_id": "0x...",  // This is the asset ID for NO
      "outcome": "No"
    }
  ]
}
```

### Option 2: Polymarket Gamma API

The Gamma API provides market metadata:

```bash
# Get markets
curl "https://gamma-api.polymarket.com/markets"

# Get specific market
curl "https://gamma-api.polymarket.com/markets/<market_slug>"
```

### Option 3: Polymarket Website

1. Go to a market on polymarket.com
2. Open browser DevTools → Network tab
3. Look for API calls to `/markets` or `/tokens`
4. Find the `token_id` or `asset_id` fields

## How to Subscribe

### Via API Endpoint

```bash
# Subscribe to asset IDs
curl -X POST http://localhost:5000/api/market-data/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": [
      "0x1234...",  // YES token asset ID
      "0x5678..."   // NO token asset ID
    ]
  }'
```

### Example: Subscribe to Multiple Markets

```bash
# Market 1: YES and NO tokens
# Market 2: YES and NO tokens
curl -X POST http://localhost:5000/api/market-data/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": [
      "0x1111...",  // Market 1 YES
      "0x2222...",  // Market 1 NO
      "0x3333...",  // Market 2 YES
      "0x4444..."   // Market 2 NO
    ]
  }'
```

### Unsubscribe

```bash
curl -X POST http://localhost:5000/api/market-data/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "assetIds": ["0x1234...", "0x5678..."]
  }'
```

## Important Notes

1. **Subscribe to both YES and NO**: You need both asset IDs for each market to detect arbitrage
2. **Asset IDs are token addresses**: They're Ethereum addresses (0x...)
3. **Check subscription status**: Use `GET /api/market-data/status` to see how many markets you're tracking
4. **WebSocket must be connected**: Make sure the WebSocket is connected before subscribing (check status endpoint)

## Example Workflow

1. Find a market you want to trade
2. Get its condition ID or market slug
3. Query Polymarket API for that market's token IDs
4. Extract YES and NO asset IDs
5. Subscribe via `/api/market-data/subscribe`
6. Wait for order book data to flow in
7. Start arbitrage bot - it will scan subscribed markets automatically

## API Documentation

- **CLOB API**: https://docs.polymarket.com/developers/CLOB/rest-api
- **Gamma API**: https://gamma-api.polymarket.com/docs
- **WebSocket**: https://docs.polymarket.com/developers/CLOB/websocket/wss-overview

