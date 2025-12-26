import { useState, useEffect } from 'react'
import type { Position } from '../types/api.js'

const POLL_INTERVAL = 1000 // 1 second

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const response = await fetch('/api/positions')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setPositions(data.positions || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch positions')
        console.error('Error fetching positions:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPositions()
    const interval = setInterval(fetchPositions, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  const closePosition = async (marketId: string) => {
    try {
      const response = await fetch(`/api/positions/${marketId}/close`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      // Position will be updated on next poll
    } catch (err) {
      console.error('Error closing position:', err)
      throw err
    }
  }

  return { positions, loading, error, closePosition }
}

