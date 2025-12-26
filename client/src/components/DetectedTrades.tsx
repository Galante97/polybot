import { useState, useEffect } from 'react'
import './DetectedTrades.css'

interface PolymarketTrade {
  proxyWallet: string
  side: 'BUY' | 'SELL'
  asset: string
  conditionId: string
  size: number
  price: number
  timestamp: number
  title?: string
  slug?: string
  outcome?: string
  transactionHash: string
}

interface TrackedUser {
  address: string
  name?: string
  pseudonym?: string
}

interface DetectedTrade {
  trade: PolymarketTrade
  trackedUser: TrackedUser
  detectedAt: number
  executed: boolean
  executedAt?: number
  executionError?: string
}

function DetectedTrades(): JSX.Element {
  const [trades, setTrades] = useState<DetectedTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDetectedTrades = async () => {
      try {
        const response = await fetch('/api/copy-trading/detected-trades?limit=50')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setTrades(data.trades || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch detected trades')
        console.error('Error fetching detected trades:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDetectedTrades()
    const interval = setInterval(fetchDetectedTrades, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [])

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

  const getTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  if (loading && trades.length === 0) {
    return (
      <div className="detected-trades-panel">
        <div className="panel-header">
          <h2>Detected Trades</h2>
        </div>
        <div className="panel-content">Loading...</div>
      </div>
    )
  }

  return (
    <div className="detected-trades-panel">
      <div className="panel-header">
        <h2>Detected Trades</h2>
        <span className="trade-count">{trades.length}</span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="panel-content">
        {trades.length === 0 ? (
          <div className="empty-state">
            <p>No trades detected yet.</p>
            <p className="empty-hint">Trades from tracked users will appear here.</p>
          </div>
        ) : (
          <div className="detected-trades-list">
            {trades.map((detectedTrade) => {
              const { trade, trackedUser, executed, executedAt, executionError, detectedAt } =
                detectedTrade
              const userName = trackedUser.name || trackedUser.pseudonym || 'Unknown'

              return (
                <div
                  key={trade.transactionHash}
                  className={`detected-trade-card ${executed ? 'executed' : 'pending'} ${executionError ? 'error' : ''}`}
                >
                  <div className="trade-header">
                    <div className="trade-user-info">
                      <span className="user-name">{userName}</span>
                      <span className="trade-time" title={formatDate(detectedAt)}>
                        {getTimeAgo(detectedAt)}
                      </span>
                    </div>
                    <div className="trade-status">
                      {executed ? (
                        <span className="status-badge executed" title={executedAt ? formatDate(executedAt) : ''}>
                          ✅ Executed
                        </span>
                      ) : executionError ? (
                        <span className="status-badge error">❌ Failed</span>
                      ) : (
                        <span className="status-badge pending">⏳ Pending</span>
                      )}
                    </div>
                  </div>

                  <div className="trade-details">
                    <div className="trade-main-info">
                      <div className="trade-market">
                        {trade.title || `${trade.conditionId.substring(0, 20)}...`}
                      </div>
                      <div className="trade-action-side">
                        <span className={`action-badge ${trade.side.toLowerCase()}`}>
                          {trade.side}
                        </span>
                        {trade.outcome && (
                          <span className="outcome-badge">{trade.outcome}</span>
                        )}
                      </div>
                    </div>

                    <div className="trade-metrics">
                      <div className="metric">
                        <span className="metric-label">Size:</span>
                        <span className="metric-value">{formatCurrency(trade.size)}</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">Price:</span>
                        <span className="metric-value">{formatPrice(trade.price)}</span>
                      </div>
                    </div>

                    {executionError && (
                      <div className="execution-error">
                        <strong>Error:</strong> {executionError}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default DetectedTrades

