import type { Position } from '../types/api'
import './PositionCard.css'

interface PositionCardProps {
  position: Position
  onClose: () => void
}

function PositionCard({ position, onClose }: PositionCardProps): JSX.Element {
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPrice = (price: number | null): string => {
    if (price === null) return 'N/A'
    return price.toFixed(4)
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const yesValue = position.yesTokens * (position.yesCurrentPrice || 0)
  const noValue = position.noTokens * (position.noCurrentPrice || 0)
  const totalValue = yesValue + noValue

  return (
    <div
      className={`position-card ${position.unrealizedPnL >= 0 ? 'profit' : 'loss'}`}
    >
      <div className="position-header">
        <span className="position-market-id">
          {position.marketId.substring(0, 20)}...
        </span>
        <button className="btn-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="position-details">
        <div className="position-side">
          <div className="side-header">YES</div>
          <div className="side-details">
            <div>Tokens: {position.yesTokens.toFixed(4)}</div>
            <div>Entry: {formatPrice(position.yesEntryPrice)}</div>
            <div>Current: {formatPrice(position.yesCurrentPrice)}</div>
            <div>Value: {formatCurrency(yesValue)}</div>
          </div>
        </div>
        <div className="position-side">
          <div className="side-header">NO</div>
          <div className="side-details">
            <div>Tokens: {position.noTokens.toFixed(4)}</div>
            <div>Entry: {formatPrice(position.noEntryPrice)}</div>
            <div>Current: {formatPrice(position.noCurrentPrice)}</div>
            <div>Value: {formatCurrency(noValue)}</div>
          </div>
        </div>
      </div>
      <div className="position-summary">
        <div className="summary-row">
          <span>Total Value:</span>
          <span>{formatCurrency(totalValue)}</span>
        </div>
        <div className="summary-row">
          <span>Entry Cost:</span>
          <span>{formatCurrency(position.totalEntryCost)}</span>
        </div>
        <div className="summary-row pnl-row">
          <span>Unrealized PnL:</span>
          <span className={position.unrealizedPnL >= 0 ? 'positive' : 'negative'}>
            {formatCurrency(position.unrealizedPnL)}
          </span>
        </div>
        <div className="summary-row">
          <span>Entry Time:</span>
          <span>{formatDate(position.entryTimestamp)}</span>
        </div>
      </div>
    </div>
  )
}

export default PositionCard

