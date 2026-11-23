import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './GameManager.css'

// Backstage screen (deliberately unlinked): list every game on the server,
// jump back into one, or clean one up. Launch sits left and Delete right,
// with a two-click confirm, so a stray click never kills a game.
function GameManager() {
  const navigate = useNavigate()
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/games')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const list = await res.json()
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setGames(list)
      setError(null)
    } catch (err) {
      setError(`Could not load games: ${err.message}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // A pending delete-confirm resets itself after a beat
  useEffect(() => {
    if (!confirmId) return
    const t = setTimeout(() => setConfirmId(null), 3500)
    return () => clearTimeout(t)
  }, [confirmId])

  const remove = async (gameId) => {
    if (confirmId !== gameId) {
      setConfirmId(gameId)
      return
    }
    setConfirmId(null)
    try {
      const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    }
    load()
  }

  const stageFor = (g) => {
    if (g.status === 'waiting') return { label: 'In lobby', cls: 'waiting' }
    if (g.wagerActive) return { label: 'Contest live', cls: 'live' }
    return { label: 'Playing', cls: 'playing' }
  }

  const when = (iso) => {
    const d = new Date(iso)
    return isNaN(d) ? '—' : d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="game-manager">
      <div className="gm-content">
        <p className="gm-kicker">Backstage</p>
        <h1 className="gm-title">Game Manager</h1>

        {error && <div className="gm-error">{error}</div>}

        {games === null && !error && <p className="gm-note">Loading games…</p>}

        {games && games.length === 0 && (
          <p className="gm-note">No games on the server right now.</p>
        )}

        {games && games.length > 0 && (
          <table className="gm-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Host</th>
                <th>Players</th>
                <th>Stage</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => {
                const stage = stageFor(g)
                return (
                  <tr key={g.id}>
                    <td className="gm-code">{g.id}</td>
                    <td className="gm-host">{g.hostName}</td>
                    <td className="gm-count">{g.playerCount}</td>
                    <td><span className={`gm-stage ${stage.cls}`}>{stage.label}</span></td>
                    <td className="gm-when">{when(g.createdAt)}</td>
                    <td className="gm-actions">
                      <button
                        className="gm-launch"
                        onClick={() => navigate(`/?game=${g.id}`)}
                      >
                        Launch
                      </button>
                      <button
                        className={`gm-delete ${confirmId === g.id ? 'danger' : ''}`}
                        onClick={() => remove(g.id)}
                      >
                        {confirmId === g.id ? 'Sure?' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <button className="gm-refresh" onClick={load}>↻ Refresh</button>
      </div>
    </div>
  )
}

export default GameManager
