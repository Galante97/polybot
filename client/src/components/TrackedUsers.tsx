import { useState, useEffect } from 'react'
import './TrackedUsers.css'

interface TrackedUser {
  address: string
  name?: string
  pseudonym?: string
  bio?: string
  profileImage?: string
}

function TrackedUsers(): JSX.Element {
  const [users, setUsers] = useState<TrackedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newAddress, setNewAddress] = useState('')
  const [newName, setNewName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchUsers()
    const interval = setInterval(fetchUsers, 2000) // Refresh every 2 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/copy-trading/tracked-users')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setUsers(data.users || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
      console.error('Error fetching tracked users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newAddress.trim()) {
      setError('Address is required')
      return
    }

    // Validate address format (0x-prefixed, 42 chars)
    if (!/^0x[a-fA-F0-9]{40}$/.test(newAddress.trim())) {
      setError('Invalid address format (must be 0x-prefixed, 40 hex chars)')
      return
    }

    try {
      const response = await fetch('/api/copy-trading/tracked-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: newAddress.trim(),
          name: newName.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add user')
      }

      setNewAddress('')
      setNewName('')
      setShowAddForm(false)
      setError(null)
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user')
      console.error('Error adding user:', err)
    }
  }

  const handleRemoveUser = async (address: string) => {
    try {
      const response = await fetch(`/api/copy-trading/tracked-users/${address}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to remove user')
      }

      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user')
      console.error('Error removing user:', err)
    }
  }

  const truncateAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  if (loading && users.length === 0) {
    return (
      <div className="tracked-users-panel">
        <div className="panel-header">
          <h2>Tracked Users</h2>
        </div>
        <div className="panel-content">Loading...</div>
      </div>
    )
  }

  return (
    <div className="tracked-users-panel">
      <div className="panel-header">
        <h2>Tracked Users</h2>
        <button
          className="btn btn-add"
          onClick={() => setShowAddForm(!showAddForm)}
          title="Add user to track"
        >
          {showAddForm ? '−' : '+'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <form className="add-user-form" onSubmit={handleAddUser}>
          <div className="form-group">
            <label htmlFor="address">Address (0x...)</label>
            <input
              id="address"
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="0x..."
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="name">Name (optional)</label>
            <input
              id="name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add User
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowAddForm(false)
                setNewAddress('')
                setNewName('')
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="panel-content">
        {users.length === 0 ? (
          <div className="empty-state">
            <p>No users tracked yet.</p>
            <p className="empty-hint">Add users above to start copying their trades.</p>
          </div>
        ) : (
          <div className="users-list">
            {users.map((user) => (
              <div key={user.address} className="user-card">
                <div className="user-info">
                  {user.profileImage && (
                    <img
                      src={user.profileImage}
                      alt={user.name || user.pseudonym || 'User'}
                      className="user-avatar"
                    />
                  )}
                  <div className="user-details">
                    <div className="user-name">
                      {user.name || user.pseudonym || 'Unknown'}
                    </div>
                    <div className="user-address" title={user.address}>
                      {truncateAddress(user.address)}
                    </div>
                    {user.bio && <div className="user-bio">{user.bio}</div>}
                  </div>
                </div>
                <button
                  className="btn btn-remove"
                  onClick={() => handleRemoveUser(user.address)}
                  title="Remove user"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TrackedUsers

