import { useMarkets } from '../hooks/useMarkets'
import MarketCard from './MarketCard'
import './MarketsPanel.css'

interface MarketsPanelProps {
  selectedMarket: string | null
  onMarketSelect: (marketId: string | null) => void
}

function MarketsPanel({ selectedMarket, onMarketSelect }: MarketsPanelProps): JSX.Element {
  const { markets, loading, error } = useMarkets()

  if (loading) {
    return (
      <div className="markets-panel">
        <h2>Live Markets</h2>
        <div className="loading">Loading markets...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="markets-panel">
        <h2>Live Markets</h2>
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  // Calculate arbitrage opportunities
  const marketsWithArb = markets.map((market) => {
    const yesAsk = market.yesPrices.ask || 0
    const noAsk = market.noPrices.ask || 0
    const totalCost = yesAsk + noAsk
    const hasArbitrage = totalCost > 0 && totalCost < 1
    const profitMargin = hasArbitrage ? 1 - totalCost : 0

    return {
      ...market,
      hasArbitrage,
      profitMargin,
      totalCost,
    }
  })

  // Sort by profit margin (highest first)
  marketsWithArb.sort((a, b) => b.profitMargin - a.profitMargin)

  return (
    <div className="markets-panel">
      <h2>Live Markets ({markets.length})</h2>
      <div className="markets-list">
        {marketsWithArb.length === 0 ? (
          <div className="empty-state">No markets available</div>
        ) : (
          marketsWithArb.map((market) => (
            <MarketCard
              key={market.marketId}
              market={market}
              isSelected={selectedMarket === market.marketId}
              onSelect={() =>
                onMarketSelect(
                  selectedMarket === market.marketId ? null : market.marketId
                )
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

export default MarketsPanel

