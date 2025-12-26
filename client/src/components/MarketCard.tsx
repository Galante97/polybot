import type { MarketData } from '../types/api'
import './MarketCard.css'

interface MarketCardProps {
  market: MarketData & {
    hasArbitrage: boolean
    profitMargin: number
    totalCost: number
  }
  isSelected: boolean
  onSelect: () => void
}

function MarketCard({ market, isSelected, onSelect }: MarketCardProps): JSX.Element {
  const formatPrice = (price: number | null): string => {
    if (price === null) return 'N/A'
    return price.toFixed(4)
  }

  const formatPercent = (value: number): string => {
    return `${(value * 100).toFixed(2)}%`
  }

  return (
    <div
      className={`market-card ${market.hasArbitrage ? 'arbitrage' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="market-card-header">
        <span className="market-id">{market.marketId.substring(0, 20)}...</span>
        {market.hasArbitrage && (
          <span className="arb-badge">Arbitrage Opportunity</span>
        )}
      </div>
      <div className="market-prices">
        <div className="price-section">
          <div className="price-label">YES</div>
          <div className="price-row">
            <span className="price-bid">Bid: {formatPrice(market.yesPrices.bid)}</span>
            <span className="price-ask">Ask: {formatPrice(market.yesPrices.ask)}</span>
          </div>
        </div>
        <div className="price-section">
          <div className="price-label">NO</div>
          <div className="price-row">
            <span className="price-bid">Bid: {formatPrice(market.noPrices.bid)}</span>
            <span className="price-ask">Ask: {formatPrice(market.noPrices.ask)}</span>
          </div>
        </div>
      </div>
      {market.hasArbitrage && (
        <div className="arb-info">
          <div className="arb-total">Total Cost: {formatPrice(market.totalCost)}</div>
          <div className="arb-profit">Profit: {formatPercent(market.profitMargin)}</div>
        </div>
      )}
      {market.isStale && <div className="stale-indicator">Stale Data</div>}
    </div>
  )
}

export default MarketCard

