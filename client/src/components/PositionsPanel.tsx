import { usePositions } from '../hooks/usePositions'
import PositionCard from './PositionCard'
import './PositionsPanel.css'

function PositionsPanel(): JSX.Element {
  const { positions, loading, error, closePosition } = usePositions()

  if (loading) {
    return (
      <div className="positions-panel">
        <h2>Open Positions</h2>
        <div className="loading">Loading positions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="positions-panel">
        <h2>Open Positions</h2>
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  // Sort by PnL (highest first)
  const sortedPositions = [...positions].sort(
    (a, b) => b.unrealizedPnL - a.unrealizedPnL
  )

  return (
    <div className="positions-panel">
      <h2>Open Positions ({positions.length})</h2>
      <div className="positions-list">
        {sortedPositions.length === 0 ? (
          <div className="empty-state">No open positions</div>
        ) : (
          sortedPositions.map((position) => (
            <PositionCard
              key={position.marketId}
              position={position}
              onClose={() => closePosition(position.marketId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default PositionsPanel

