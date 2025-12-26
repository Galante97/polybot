import { useState, useEffect } from 'react'
import type { MarketData } from '../types/api.js'

const POLL_INTERVAL = 1000 // 1 second

export function useMarkets() {
  const [markets, setMarkets] = useState<MarketData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const response = await fetch('/api/markets')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setMarkets(data.markets || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch markets')
        console.error('Error fetching markets:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMarkets()
    const interval = setInterval(fetchMarkets, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return { markets, loading, error }
}

