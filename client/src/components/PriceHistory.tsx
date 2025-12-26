import { usePriceHistory } from '../hooks/usePriceHistory'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import './PriceHistory.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

function PriceHistory(): JSX.Element {
  const { summary, loading, error } = usePriceHistory()

  if (loading) {
    return (
      <div className="price-history">
        <h3>Price History</h3>
        <div className="loading">Loading price history...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="price-history">
        <h3>Price History</h3>
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  if (!summary || summary.count === 0) {
    return (
      <div className="price-history">
        <h3>Price History</h3>
        <div className="empty-state">
          {summary?.isTracking
            ? 'No price data yet. Start the bot to begin tracking.'
            : 'Price history tracking is inactive. Start the bot to begin tracking.'}
        </div>
      </div>
    )
  }

  // Create chart data showing latest profit margins over time
  // For now, we'll show a simple bar/line chart of current profit margins
  // In a full implementation, we'd fetch full history per market and show time series
  const chartData = {
    labels: summary.summary
      .filter((s) => s.latestEntry && s.entryCount > 0)
      .slice(0, 10)
      .map((s) => s.marketId.slice(0, 8) + '...'),
    datasets: [
      {
        label: 'Latest Profit Margin (%)',
        data: summary.summary
          .filter((s) => s.latestEntry && s.entryCount > 0)
          .slice(0, 10)
          .map((s) => (s.latestEntry?.profitMargin || 0) * 100),
        borderColor: '#4ade80',
        backgroundColor: '#4ade8040',
        tension: 0.1,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Latest Profit Margins by Market',
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `Profit Margin: ${context.parsed.y.toFixed(2)}%`
          },
        },
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: 'Profit Margin (%)',
        },
        beginAtZero: true,
      },
      x: {
        title: {
          display: true,
          text: 'Market',
        },
      },
    },
  }

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const trackingDuration = summary.startTime
    ? formatDuration(Date.now() - summary.startTime)
    : 'N/A'

  return (
    <div className="price-history">
      <div className="price-history-header">
        <h3>Price History</h3>
        <div className="price-history-status">
          <span className={`status-indicator ${summary.isTracking ? 'active' : 'inactive'}`}>
            {summary.isTracking ? '●' : '○'}
          </span>
          <span className="status-text">
            {summary.isTracking ? `Tracking (${trackingDuration})` : 'Not Tracking'}
          </span>
        </div>
      </div>

      {summary.count > 0 && (
        <div className="price-history-content">
          <div className="price-history-chart">
            <Line data={chartData} options={chartOptions} />
          </div>

          <div className="price-history-table">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Latest Total Cost</th>
                  <th>Latest Profit Margin</th>
                  <th>Min Cost</th>
                  <th>Max Cost</th>
                  <th>Data Points</th>
                </tr>
              </thead>
              <tbody>
                {summary.summary.map((market) => {
                  const latest = market.latestEntry
                  return (
                    <tr key={market.marketId}>
                      <td className="market-id">{market.marketId.slice(0, 12)}...</td>
                      <td>
                        {latest?.totalCost !== null && latest?.totalCost !== undefined
                          ? latest.totalCost.toFixed(4)
                          : 'N/A'}
                      </td>
                      <td
                        className={
                          latest?.profitMargin && latest.profitMargin > 0 ? 'profit' : 'no-profit'
                        }
                      >
                        {latest?.profitMargin !== null && latest?.profitMargin !== undefined
                          ? `${(latest.profitMargin * 100).toFixed(2)}%`
                          : 'N/A'}
                      </td>
                      <td>
                        {market.minTotalCost !== null ? market.minTotalCost.toFixed(4) : 'N/A'}
                      </td>
                      <td>
                        {market.maxTotalCost !== null ? market.maxTotalCost.toFixed(4) : 'N/A'}
                      </td>
                      <td>{market.entryCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default PriceHistory

