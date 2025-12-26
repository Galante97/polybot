import { useState, useEffect } from 'react'
import type { PnLSummary } from '../types/api.js'

const POLL_INTERVAL = 1000 // 1 second

export function usePnL() {
  const [pnl, setPnL] = useState<PnLSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPnL = async () => {
      try {
        const response = await fetch('/api/pnl')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setPnL(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch PnL')
        console.error('Error fetching PnL:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPnL()
    const interval = setInterval(fetchPnL, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return { pnl, loading, error }
}

