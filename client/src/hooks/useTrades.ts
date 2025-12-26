import { useState, useEffect } from 'react'
import { TradeRecord } from '../../../server/trading/types'
// import type { TradeRecord } from '../types/api.js'

const POLL_INTERVAL = 1000 // 1 second

export function useTrades(limit: number = 100) {
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch(`/api/trades?limit=${limit}`)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setTrades(data.trades || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch trades')
        console.error('Error fetching trades:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTrades()
    const interval = setInterval(fetchTrades, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [limit])

  return { trades, loading, error }
}

