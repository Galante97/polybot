import { useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { usePnL } from '../hooks/usePnL'
import './PnLChart.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

function PnLChart(): JSX.Element {
  const { pnl } = usePnL()
  const dataHistoryRef = useRef<Array<{ time: string; pnl: number }>>([])

  useEffect(() => {
    if (pnl) {
      const now = new Date().toLocaleTimeString()
      dataHistoryRef.current.push({
        time: now,
        pnl: pnl.totalPnL,
      })

      // Keep only last 50 data points
      if (dataHistoryRef.current.length > 50) {
        dataHistoryRef.current = dataHistoryRef.current.slice(-50)
      }
    }
  }, [pnl])

  const chartData = {
    labels: dataHistoryRef.current.map((d) => d.time),
    datasets: [
      {
        label: 'Total PnL',
        data: dataHistoryRef.current.map((d) => d.pnl),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function (value) {
            return '$' + Number(value).toFixed(2)
          },
        },
      },
    },
  }

  return (
    <div className="pnl-chart">
      <h2>PnL Over Time</h2>
      <div className="chart-container">
        {dataHistoryRef.current.length === 0 ? (
          <div className="empty-chart">Waiting for data...</div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  )
}

export default PnLChart

