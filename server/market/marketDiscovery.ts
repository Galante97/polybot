/**
 * Market Discovery Service
 * Fetches markets from Polymarket Gamma API
 * Gamma API is better for market discovery with filtering and sorting options
 * See: https://docs.polymarket.com/api-reference/markets/list-markets
 */

import { logger } from '../utils/logger.js'

export interface PolymarketMarket {
  condition_id: string
  question: string
  slug?: string
  market_slug?: string
  end_date_iso: string
  image: string
  icon: string
  active: boolean
  closed?: boolean
  archived?: boolean
  accepting_orders?: boolean
  liquidity?: number
  volume?: number
  tokens: Array<{
    token_id: string // This is the asset ID
    outcome: 'Yes' | 'No' | string
  }>
}

export interface MarketDiscoveryResult {
  markets: PolymarketMarket[]
  count: number
}

export class MarketDiscoveryService {
  private readonly gammaApiUrl = 'https://gamma-api.polymarket.com'

  // Hardcoded list of markets for testing
  // TODO: Replace with API-based discovery later
  private readonly hardcodedMarkets: PolymarketMarket[] = [
    // 49ers vs Colts NFL Game Markets (Dec 22, 2025)
    {
      condition_id: '0xd8ce9952b624627778f4b469548d9a31abfecab1dd20e575f6572bb2c9f1f6a3',
      question: 'Spread: 49ers (-5.5)',
      slug: 'nfl-sf-ind-2025-12-22-spread-away-5pt5',
      end_date_iso: '2025-12-23T01:15:00Z',
      image: '',
      icon: '',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      liquidity: 0,
      volume: 0,
      tokens: [
        {
          token_id: '97641189862388861739227184960911807160706780560607278251771673784495796393542',
          outcome: '49ers',
        },
        {
          token_id: '21421088971311396862398624406442860797708228611164269012200846473815124466286',
          outcome: 'Colts',
        },
      ],
    },
    {
      condition_id: '0x13410ea718bc47ad2d1077874295f18b013f74aaf8b8d2854e3e577700ee8db0',
      question: 'Colts Team Total: O/U 20.5',
      slug: 'nfl-sf-ind-2025-12-22-team-total-ind-20pt5',
      end_date_iso: '2025-12-23T01:15:00Z',
      image: '',
      icon: '',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      liquidity: 0,
      volume: 0,
      tokens: [
        {
          token_id: '89947612917577893508027438311383057525903917918727739167661709915454106165735',
          outcome: 'Over',
        },
        {
          token_id: '34807690262197695440883883785665284295295502358644554329343159733399768862311',
          outcome: 'Under',
        },
      ],
    },
    {
      condition_id: '0xfe1ff9af15335128f958e74e9a2d8abbe3592320f76253ff5d4eb3ca14b3e40e',
      question: '49ers Team Total: O/U 26.5',
      slug: 'nfl-sf-ind-2025-12-22-team-total-sf-26pt5',
      end_date_iso: '2025-12-23T01:15:00Z',
      image: '',
      icon: '',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      liquidity: 0,
      volume: 0,
      tokens: [
        {
          token_id: '25966598479131574803630013955523491385812135940142490135474272598334170956528',
          outcome: 'Over',
        },
        {
          token_id: '23589539891364730365337253409238886442500786490464336020918627069660260854159',
          outcome: 'Under',
        },
      ],
    },
    {
      condition_id: '0xbf299374b5504af89064f6f288fe60e200bffaf449260c77626b4122cb2705de',
      question: 'Spread: 49ers (-6.5)',
      slug: 'nfl-sf-ind-2025-12-22-spread-away-6pt5',
      end_date_iso: '2025-12-22T20:15:00Z',
      image: '',
      icon: '',
      active: true,
      closed: false,
      archived: false,
      accepting_orders: true,
      liquidity: 0,
      volume: 0,
      tokens: [
        {
          token_id: '46774103795938026640576480242990130082519921155395673325844205571511601222303',
          outcome: '49ers',
        },
        {
          token_id: '23139790491852950444123717475154841583302035305923870450944024851428093084396',
          outcome: 'Colts',
        },
      ],
    },
    // Add more markets here as needed
  ]

  constructor() {
    logger.debug('Initialized Polymarket Gamma API client', {
      host: this.gammaApiUrl,
      hardcodedMarketsCount: this.hardcodedMarkets.length,
    })
  }

  /**
   * Fetch markets from Polymarket Gamma API
   * NOTE: Currently returns hardcoded list for testing
   * TODO: Replace with API-based discovery later
   * 
   * Gamma API supports better filtering: closed=false, ascending=false for newest first
   * See: https://gamma-api.polymarket.com/markets?closed=false&limit=100
   */
  async fetchMarkets(limit: number = 100, offset: number = 0): Promise<MarketDiscoveryResult> {
    try {
      // TEMPORARY: Return hardcoded markets for testing
      // TODO: Replace with actual API call
      logger.debug('Fetching hardcoded markets (testing mode)', {
        limit,
        offset,
        availableMarkets: this.hardcodedMarkets.length,
      })

      const markets = this.hardcodedMarkets.slice(offset, offset + limit)

      logger.info('Fetched hardcoded markets', {
        returned: markets.length,
        total: this.hardcodedMarkets.length,
      })

      return {
        markets,
        count: markets.length,
      }

      /* 
      // FUTURE: Uncomment when ready to use API-based discovery
      const url = `${this.gammaApiUrl}/markets?closed=false&ascending=false&limit=${limit}`
      
      logger.debug('Fetching markets from Gamma API', { url, limit })

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`)
      }

      const markets = await response.json()

      if (!Array.isArray(markets)) {
        throw new Error('Gamma API returned invalid response format')
      }

      // Map Gamma API markets to our interface
      const mappedMarkets = markets
        .map((market) => this.mapGammaMarketToPolymarketMarket(market))
        .filter(
          (market) =>
            market.active &&
            !market.archived &&
            market.tokens &&
            market.tokens.length >= 2 &&
            market.condition_id &&
            market.question
        )

      logger.info('Fetched markets from Gamma API', {
        total: markets.length,
        active: mappedMarkets.length,
        returned: mappedMarkets.length,
      })

      return {
        markets: mappedMarkets,
        count: mappedMarkets.length,
      }
      */
    } catch (error) {
      logger.error('Error fetching markets', { error })
      throw error
    }
  }

  /**
   * Map Gamma API Market type to our PolymarketMarket interface
   * Gamma API format: { conditionId, question, slug, endDate, acceptingOrders, clobTokenIds, outcomes, ... }
   */
  private mapGammaMarketToPolymarketMarket(market: any): PolymarketMarket {
    // Parse clobTokenIds (JSON string array) and outcomes (JSON string array)
    let tokenIds: string[] = []
    let outcomes: string[] = []

    try {
      if (typeof market.clobTokenIds === 'string') {
        tokenIds = JSON.parse(market.clobTokenIds)
      } else if (Array.isArray(market.clobTokenIds)) {
        tokenIds = market.clobTokenIds
      }

      if (typeof market.outcomes === 'string') {
        outcomes = JSON.parse(market.outcomes)
      } else if (Array.isArray(market.outcomes)) {
        outcomes = market.outcomes
      }
    } catch (error) {
      logger.warn('Failed to parse token IDs or outcomes', { error, market: market.question })
    }

    // Map token IDs to outcomes
    const tokens = tokenIds.map((tokenId, index) => ({
      token_id: tokenId,
      outcome: outcomes[index] || (index === 0 ? 'Yes' : 'No'),
    }))

    return {
      condition_id: market.conditionId || market.condition_id,
      question: market.question,
      slug: market.slug,
      end_date_iso: market.endDate || market.end_date_iso || market.endDateIso,
      image: market.image || '',
      icon: market.icon || '',
      active: market.active !== false, // Default to true if not specified
      closed: market.closed === true,
      archived: market.archived === true,
      accepting_orders: market.acceptingOrders !== false, // Default to true if not specified
      liquidity: market.liquidityNum || market.liquidity,
      volume: market.volumeNum || market.volume,
      tokens,
    }
  }

  /**
   * Search markets by query string using Gamma API public-search endpoint
   * The public-search endpoint returns events with nested markets
   * See: https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles
   */
  async searchMarkets(query: string, limit: number = 50): Promise<MarketDiscoveryResult> {
    try {
      // Use Gamma API's public-search endpoint
      // q: Search query (required)
      // limit_per_type: Limit results per type (events, tags, profiles)
      // events_status: Filter by event status (we want active events)
      // keep_closed_markets: Set to 0 to exclude closed markets
      const url = `${this.gammaApiUrl}/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limit * 2}&events_status=active&keep_closed_markets=0`
      
      logger.debug('Searching markets from Gamma API public-search', { query, url })

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`)
      }

      const searchResults = await response.json()

      // public-search returns { events: [...], tags: [...], profiles: [...], pagination: {...} }
      // Each event has a markets array
      const events = searchResults.events || []
      
      // Flatten all markets from all events
      const allMarkets: any[] = []
      for (const event of events) {
        if (event.markets && Array.isArray(event.markets)) {
          allMarkets.push(...event.markets)
        }
      }

      logger.debug('Extracted markets from search results', {
        eventsCount: events.length,
        marketsCount: allMarkets.length,
      })

      // Map and filter for valid markets
      const matchingMarkets = allMarkets
        .map((market) => this.mapGammaMarketToPolymarketMarket(market))
        .filter(
          (market) =>
            market.active &&
            !market.archived &&
            market.tokens &&
            market.tokens.length >= 2 &&
            market.condition_id &&
            market.question
        )
        .slice(0, limit) // Limit to requested number

      logger.info('Searched markets via public-search', {
        query,
        found: matchingMarkets.length,
        totalMarkets: allMarkets.length,
        eventsSearched: events.length,
      })

      return {
        markets: matchingMarkets,
        count: matchingMarkets.length,
      }
    } catch (error) {
      logger.error('Error searching markets', { error, query })
      throw error
    }
  }

  /**
   * Get asset IDs for a market (YES and NO tokens)
   * For markets with custom outcomes, returns the first two tokens
   */
  getAssetIds(market: PolymarketMarket): { yesAssetId: string | null; noAssetId: string | null } {
    if (!market.tokens || market.tokens.length < 2) {
      return { yesAssetId: null, noAssetId: null }
    }

    // First try to find explicit YES/NO tokens
    const yesToken = market.tokens.find((t) => t.outcome === 'Yes')
    const noToken = market.tokens.find((t) => t.outcome === 'No')

    if (yesToken && noToken) {
      return {
        yesAssetId: yesToken.token_id || null,
        noAssetId: noToken.token_id || null,
      }
    }

    // For markets with custom outcomes (e.g., team names), use first two tokens
    // Note: For arbitrage, we ideally want YES/NO markets, but this allows subscribing to any binary market
    const token1 = market.tokens[0]
    const token2 = market.tokens[1]

    return {
      yesAssetId: token1?.token_id || null,
      noAssetId: token2?.token_id || null,
    }
  }

  /**
   * Get a single market by condition ID using Gamma API
   */
  async getMarket(conditionId: string): Promise<PolymarketMarket | null> {
    try {
      // Gamma API doesn't have a direct endpoint for condition ID
      // We'll search through markets (this is not ideal, but works)
      const url = `${this.gammaApiUrl}/markets?closed=false&limit=1000`
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`)
      }

      const markets = await response.json()

      if (!Array.isArray(markets)) {
        return null
      }

      const market = markets.find((m) => m.conditionId === conditionId || m.condition_id === conditionId)

      if (!market) {
        return null
      }

      return this.mapGammaMarketToPolymarketMarket(market)
    } catch (error) {
      logger.error('Error fetching market by condition ID', { error, conditionId })
      return null
    }
  }
}

