import { useTrades } from '../hooks/useTrades'
import './TradeHistory.css'

function TradeHistory(): JSX.Element {
  const { trades, loading, error } = useTrades(50)

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPrice = (price: number): string => {
    return price.toFixed(4)
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  if (loading) {
    return (
      <div className="trade-history">
        <h2>Trade History</h2>
        <div className="loading">Loading trades...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="trade-history">
        <h2>Trade History</h2>
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="trade-history">
      <h2>Recent Trades ({trades.length})</h2>
      <div className="trade-table-container">
        <table className="trade-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Market</th>
              <th>Side</th>
              <th>Action</th>
              <th>Size</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No trades yet
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.tradeId}>
                  <td>{formatDate(trade.timestamp)}</td>
                  <td className="market-cell">
                    {trade.marketId.substring(0, 15)}...
                  </td>
                  <td>
                    <span className={`side-badge ${trade.side.toLowerCase()}`}>
                      {trade.side}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`action-badge ${trade.action.toLowerCase()}`}
                    >
                      {trade.action}
                    </span>
                  </td>
                  <td>{formatCurrency(trade.size)}</td>
                  <td>{formatPrice(trade.price)}</td>
                  <td>
                    <span className={`status-badge ${trade.status}`}>
                      {trade.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TradeHistory

