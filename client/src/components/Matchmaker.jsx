import React, { useState, useEffect } from 'react'
import {
  rng,
  generateSeed,
  createCostFunction,
  buildChallenges,
  solveMatchmaking,
  checkFeasible,
  optimizeMatchOrdering
} from '../lib/matchmakerSolver'
import { avatarFor } from '../lib/avatars'
import './Matchmaker.css'

// The Matchmaker is read-only: it loads real players and rankings from a
// game (?game=CODE), or displays a shared schedule (?save=...). There is no
// manual editing — rankings come from the lobby.
function Matchmaker() {
  const params = new URLSearchParams(window.location.search)
  const gameCode = (params.get('game') || '').toUpperCase()
  const saveParam = params.get('save')

  const [gameInfo, setGameInfo] = useState(null) // { gameId, players, categories, cats }
  const [loadError, setLoadError] = useState('')
  const [targetGap, setTargetGap] = useState(2)
  const [gapMode, setGapMode] = useState('loose')
  const [matchups, setMatchups] = useState(null) // [{ number, category, high, low, matchup }]
  const [isViewOnly, setIsViewOnly] = useState(false)
  const [solveStatus, setSolveStatus] = useState('')
  const [solveError, setSolveError] = useState('')
  const [shareStatus, setShareStatus] = useState('')

  // Load either a shared schedule or live game state
  useEffect(() => {
    // ?save= : a shared, view-only schedule. Parsed as data and rendered as
    // React elements, never as HTML, so a crafted URL cannot inject markup.
    if (saveParam) {
      try {
        const decoded = atob(saveParam)
        const loaded = decoded.split('|').map(str => {
          const [number, category, high, low, matchup] = str.split(':')
          return { number: parseInt(number), category, high, low, matchup }
        })
        setMatchups(loaded)
        setIsViewOnly(true)
      } catch {
        setLoadError('This shared matchup link is not valid.')
      }
      return
    }

    if (!gameCode) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}`)
        if (!res.ok) throw new Error(`No game found with code ${gameCode}`)
        const game = await res.json()
        if (cancelled) return
        if (!game.categories || game.categories.length < 2) {
          throw new Error('This game has no ranking categories, so there is nothing to match.')
        }

        const players = game.players
          .filter(pid => game.playerRankings[pid])
          .map(pid => ({
            pid,
            name: game.playerNames[pid] || 'Unknown Player',
            ranks: game.playerRankings[pid]
          }))

        const cats = game.categories.map((name, i) => ({
          name,
          count: (game.challengesPerCategory && game.challengesPerCategory[i]) || 1
        }))

        setGameInfo({ gameId: game.id, players, categories: game.categories, cats })
        setTargetGap(Math.max(1, Math.ceil(game.categories.length / 2)))
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [gameCode, saveParam])

  const makeMatches = () => {
    if (!gameInfo) return
    const { players, categories, cats } = gameInfo
    const challenges = buildChallenges(cats)
    const N = players.length

    setMatchups(null)
    setSolveError('')

    if (N < 2) {
      setSolveError('Need at least 2 players with submitted rankings.')
      return
    }
    if (challenges.length < N) {
      setSolveError(`Not enough challenges: ${challenges.length} for ${N} players. Add challenges in the game setup.`)
      return
    }

    setSolveStatus('Solving…')
    // Let the status paint before the solver blocks the thread
    setTimeout(() => {
      const feasible = checkFeasible(players, categories, challenges, {
        selectN: N,
        requireCoverAll: false,
        timeLimitMs: 2000
      })
      if (!feasible) {
        setSolveStatus('')
        setSolveError('No full schedule exists for these rankings — add challenges or categories.')
        return
      }

      const seed = generateSeed()
      const costFn = createCostFunction(targetGap, gapMode, rng(seed))
      const res = solveMatchmaking(players, categories, challenges, {
        targetGap,
        timeLimitMs: 10000,
        costFn,
        selectN: N,
        coverPenaltyPerMissing: 10,
        requireCoverAll: false,
        randomSeed: seed
      })
      setSolveStatus('')
      if (!res.ok) {
        setSolveError(`Error: ${res.reason}`)
        return
      }

      const ordered = optimizeMatchOrdering(res.assignments, seed)
      setMatchups(ordered.map((a, i) => ({
        number: i + 1,
        category: a.category,
        high: a.high,
        low: a.low,
        matchup: `${a.highRank} vs ${a.lowRank}`
      })))
    }, 30)
  }

  const copyShareLink = () => {
    if (!matchups || matchups.length === 0) return
    const compact = matchups.map(m => `${m.number}:${m.category}:${m.high}:${m.low}:${m.matchup}`).join('|')
    const url = `${window.location.origin}/matchmaker?save=${btoa(compact)}`
    navigator.clipboard.writeText(url).then(() => {
      setShareStatus('Link copied!')
      setTimeout(() => setShareStatus(''), 2500)
    }).catch(() => {
      prompt('Share this link:', url)
    })
  }

  // Per-category usage badges: how many of each category's challenges the
  // proposed schedule uses (dots when the totals are known)
  const usageRow = matchups && matchups.length > 0 && (() => {
    const used = {}
    for (const m of matchups) used[m.category] = (used[m.category] || 0) + 1

    const entries = gameInfo
      ? gameInfo.cats.map(c => ({ name: c.name, used: used[c.name] || 0, total: c.count }))
      : Object.entries(used).map(([name, u]) => ({ name, used: u, total: null }))

    return (
      <div className="mm-cat-usage">
        {entries.map(c => (
          <span
            key={c.name}
            className={`mm-cat-badge ${c.used === 0 ? 'unused' : ''}`}
            title={c.total != null
              ? `${c.used} of ${c.total} ${c.name} challenges used`
              : `${c.used} ${c.name} challenge${c.used === 1 ? '' : 's'} used`}
          >
            {c.name}
            {c.total != null ? (
              <span className="mm-dots">
                {Array.from({ length: c.total }, (_, i) => (
                  <span key={i} className={i < c.used ? 'dot on' : 'dot'} />
                ))}
              </span>
            ) : (
              <b>×{c.used}</b>
            )}
          </span>
        ))}
      </div>
    )
  })()

  const matchupsTable = matchups && matchups.length > 0 && (
    <table className="mm-table">
      <thead>
        <tr><th>#</th><th>Category</th><th>Favorite</th><th>Underdog</th><th>Matchup</th></tr>
      </thead>
      <tbody>
        {matchups.map((m) => (
          <tr key={m.number}>
            <td>{m.number}</td>
            <td>{m.category}</td>
            <td className="mm-fav">{m.high}</td>
            <td>{m.low}</td>
            <td>{m.matchup}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="matchmaker">
      <div className="mm-content">
        <div className="round-strip">Matchmaker</div>

        {/* Shared view-only schedule */}
        {isViewOnly && (
          <>
            <h1 className="mm-title">Tonight's Matchups</h1>
            {usageRow}
            {matchupsTable}
          </>
        )}

        {/* No source at all */}
        {!isViewOnly && !gameCode && !loadError && (
          <>
            <h1 className="mm-title">No Game Loaded</h1>
            <p className="mm-note">Open the Matchmaker from your game lobby — it loads the real players and rankings from there.</p>
          </>
        )}

        {loadError && (
          <>
            <h1 className="mm-title">Hmm.</h1>
            <p className="mm-note">{loadError}</p>
          </>
        )}

        {/* Live game mode */}
        {gameInfo && (
          <>
            <h1 className="mm-title">Game {gameInfo.gameId}</h1>
            <p className="mm-note">
              {gameInfo.players.length} ranked player{gameInfo.players.length === 1 ? '' : 's'} · {gameInfo.cats.reduce((s, c) => s + c.count, 0)} challenges · reload to pick up new rankings
            </p>

            <div className="mm-roster">
              {gameInfo.players.map(p => (
                <div key={p.pid} className="player-chip">
                  <span className="chip-avatar">{avatarFor(p.pid)}</span>
                  <span className="chip-name">{p.name}</span>
                </div>
              ))}
            </div>

            <div className="mm-controls">
              <div className="cg-stepper">
                <div className="cg-stepper-label">Spacing target</div>
                <div className="odds-stepper">
                  <button type="button" onClick={() => setTargetGap(g => Math.max(1, g - 1))} disabled={targetGap <= 1}>−</button>
                  <span>{targetGap}</span>
                  <button type="button" onClick={() => setTargetGap(g => Math.min(gameInfo.categories.length, g + 1))} disabled={targetGap >= gameInfo.categories.length}>+</button>
                </div>
              </div>
              <div className="cg-stepper">
                <div className="cg-stepper-label">Gap mode</div>
                <div className="cat-pills">
                  {['strict', 'loose', 'chaos'].map(mode => (
                    <button
                      type="button"
                      key={mode}
                      className={`cat-pill ${gapMode === mode ? 'on' : ''}`}
                      onClick={() => setGapMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="mega-btn" onClick={makeMatches} disabled={!!solveStatus}>
              {solveStatus || (matchups ? 'RESHUFFLE ★' : 'MAKE MATCHES ★')}
            </button>

            {solveError && <div className="mm-error">{solveError}</div>}

            {usageRow}
            {matchupsTable}

            {matchups && matchups.length > 0 && (
              <div className="mm-share">
                <button className="copy-link" onClick={copyShareLink}>
                  {shareStatus || '🔗 Copy shareable link'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Matchmaker
