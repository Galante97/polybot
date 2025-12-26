import { useState, useEffect } from 'react'
import type { MarketPriceHistory, PriceHistorySummary } from '../types/api.js'

const POLL_INTERVAL = 2000 // 2 seconds

export function usePriceHistory(marketId?: string) {
  const [history, setHistory] = useState<MarketPriceHistory | null>(null)
  const [summary, setSummary] = useState<PriceHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        if (marketId) {
          const response = await fetch(`/api/price-history?marketId=${marketId}`)
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const data: MarketPriceHistory = await response.json()
          setHistory(data)
        } else {
          const response = await fetch('/api/price-history/summary')
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const data: PriceHistorySummary = await response.json()
          setSummary(data)
        }
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch price history')
        console.error('Error fetching price history:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
    const interval = setInterval(fetchHistory, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [marketId])

  return { history, summary, loading, error }
}

