import { useState, useEffect } from 'react'

const POLL_INTERVAL = 1000 // 1 second

export function useBalance() {
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch('/api/balance')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        setBalance(data.balance || 0)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch balance')
        console.error('Error fetching balance:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return { balance, loading, error }
}

