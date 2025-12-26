import { useState, useEffect } from 'react'
import { usePnL } from '../hooks/usePnL'
import { useBalance } from '../hooks/useBalance'
import './Header.css'

function Header(): JSX.Element {
  const { pnl } = usePnL()
  const { balance } = useBalance()
  const [copyTradingRunning, setCopyTradingRunning] = useState(false)
  const [trackedUsersCount, setTrackedUsersCount] = useState(0)

  useEffect(() => {
    const fetchCopyTradingStatus = async () => {
      try {
        const response = await fetch('/api/copy-trading/status')
        if (response.ok) {
          const data = await response.json()
          setCopyTradingRunning(data.running)
          setTrackedUsersCount(data.trackedUsersCount || 0)
        }
      } catch (error) {
        console.error('Error fetching copy trading status:', error)
      }
    }

    fetchCopyTradingStatus()
    const interval = setInterval(fetchCopyTradingStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  const toggleCopyTrading = async () => {
    try {
      const endpoint = copyTradingRunning ? '/api/copy-trading/stop' : '/api/copy-trading/start'
      const response = await fetch(endpoint, { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        setCopyTradingRunning(data.status.running)
      }
    } catch (error) {
      console.error('Error toggling copy trading:', error)
    }
  }

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const roi =
    pnl && pnl.startingCapital > 0
      ? ((pnl.totalPnL / pnl.startingCapital) * 100).toFixed(2)
      : '0.00'

  return (
    <header className="dashboard-header">
      <div className="header-left">
        <h1 className="header-title">Polybot Dashboard</h1>
        <span className="header-badge">Paper Trading</span>
      </div>
      <div className="header-stats">
        <div className="stat-item">
          <span className="stat-label">Balance</span>
          <span className="stat-value">{formatCurrency(balance)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total PnL</span>
          <span
            className={`stat-value ${pnl && pnl.totalPnL >= 0 ? 'positive' : 'negative'}`}
          >
            {pnl ? formatCurrency(pnl.totalPnL) : '$0.00'}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">ROI</span>
          <span
            className={`stat-value ${parseFloat(roi) >= 0 ? 'positive' : 'negative'}`}
          >
            {formatPercent(parseFloat(roi))}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Open Positions</span>
          <span className="stat-value">{pnl?.openPositions || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Realized PnL</span>
          <span
            className={`stat-value ${pnl && pnl.totalRealizedPnL >= 0 ? 'positive' : 'negative'}`}
          >
            {pnl ? formatCurrency(pnl.totalRealizedPnL) : '$0.00'}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Unrealized PnL</span>
          <span
            className={`stat-value ${pnl && pnl.totalUnrealizedPnL >= 0 ? 'positive' : 'negative'}`}
          >
            {pnl ? formatCurrency(pnl.totalUnrealizedPnL) : '$0.00'}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <div className="arbitrage-status">
          <span className="arb-status-label">Copy Trading:</span>
          <span className={`arb-status-badge ${copyTradingRunning ? 'running' : 'stopped'}`}>
            {copyTradingRunning ? 'Running' : 'Stopped'}
          </span>
          {trackedUsersCount > 0 && (
            <span className="arb-opportunities">{trackedUsersCount} users tracked</span>
          )}
        </div>
        <button
          className={`btn ${copyTradingRunning ? 'btn-stop' : 'btn-start'}`}
          onClick={toggleCopyTrading}
        >
          {copyTradingRunning ? 'Stop Bot' : 'Start Bot'}
        </button>
        <button
          className="btn btn-flatten"
          onClick={async () => {
            try {
              await fetch('/api/positions/flatten', { method: 'POST' })
            } catch (error) {
              console.error('Error flattening positions:', error)
            }
          }}
        >
          Flatten All
        </button>
      </div>
    </header>
  )
}

export default Header

