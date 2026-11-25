import React, { useState, useEffect } from 'react'
import { generateSeed } from '../lib/matchmakerSolver'
import { runSolveSchedule } from '../lib/matchmakerRunner'
import Avatar from './Avatar'
import './Matchmaker.css'

// The Matchmaker is read-only: it loads real players and rankings from a
// game (?game=CODE), or displays a shared schedule (?save=...). There is no
// manual editing — rankings come from the lobby.
function Matchmaker() {
  const params = new URLSearchParams(window.location.search)
  const gameCode = (params.get('game') || '').toUpperCase()
  const saveParam = params.get('save')

  const [gameInfo, setGameInfo] = useState(null) // { gameId, players, categories, cats, status }
  const [loadError, setLoadError] = useState('')
  // Every schedule shown this visit, oldest first, and which one is on
  // screen: ‹ › step through them, and each RESHUFFLE adds one as far from
  // all the others as the solver can find. Each schedule is
  // [{ number, category, high, low, matchup, highRank, lowRank, gap, challenge }]
  const [schedules, setSchedules] = useState({ list: [], pos: -1 })
  const matchups = schedules.list[schedules.pos] || null
  // Change the schedule on screen (or start the list with one)
  const setMatchups = (next) => setSchedules(s => {
    const value = typeof next === 'function' ? next(s.list[s.pos]) : next
    if (s.pos < 0) return { list: [value], pos: 0 }
    const list = s.list.slice()
    list[s.pos] = value
    return { ...s, list }
  })
  const showSchedule = (pos) => setSchedules(s => ({ ...s, pos: Math.max(0, Math.min(s.list.length - 1, pos)) }))
  // Which schedule in the list is the one saved into the game, if any
  const [savedPos, setSavedPos] = useState(null)
  const saved = savedPos !== null && savedPos === schedules.pos
  const setSaved = (isSaved) => setSavedPos(isSaved ? schedules.pos : null)
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
          // The matchup field is "highRank vs lowRank" — recover the ranks
          const parsed = /^(\d+) vs (\d+)$/.exec(matchup || '')
          const highRank = parsed ? parseInt(parsed[1]) : NaN
          const lowRank = parsed ? parseInt(parsed[2]) : NaN
          return {
            number: parseInt(number), category, high, low, matchup,
            highRank, lowRank, gap: lowRank - highRank
          }
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

        setGameInfo({
          gameId: game.id,
          players,
          categories: game.categories,
          cats,
          status: game.status,
          playerAvatars: game.playerAvatars || {}
        })

        // A schedule already saved into the game is the starting display
        if (Array.isArray(game.matchups) && game.matchups.length > 0) {
          setMatchups(game.matchups.map(m => ({
            number: m.number,
            category: m.category,
            high: game.playerNames[m.highId] || 'Unknown',
            low: game.playerNames[m.lowId] || 'Unknown',
            matchup: `${m.highRank} vs ${m.lowRank}`,
            highRank: m.highRank,
            lowRank: m.lowRank,
            gap: m.gap,
            challenge: m.challenge || '',
            played: !!m.played,
            skipped: !!m.skipped
          })))
          setSavedPos(0)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [gameCode, saveParam])

  // A lobby-stage game with no saved schedule solves itself on open — the
  // first set of matchups is one click fewer for the host
  useEffect(() => {
    if (gameInfo && gameInfo.status !== 'playing' && !matchups && !solveStatus && !solveError) {
      makeMatches()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameInfo])

  const makeMatches = async () => {
    if (!gameInfo || solveStatus) return
    const { players, categories, cats } = gameInfo
    setSolveError('')
    setSolveStatus('Solving…')
    const result = await runSolveSchedule({
      players: players.map(p => ({ name: p.name, ranks: p.ranks })),
      categories,
      cats,
      seed: generateSeed(),
      history: schedules.list
    })
    setSolveStatus('')
    if (!result.ok) {
      setSolveError(result.error)
      return
    }
    setSchedules(s => ({ list: [...s.list, result.matchups], pos: s.list.length }))
  }

  // Save the schedule into the game itself: it becomes the running order of
  // the night, and unlocks Start Game in the lobby
  const saveMatchups = async () => {
    if (!matchups || matchups.length === 0 || !gameInfo) return
    const nameToPid = {}
    gameInfo.players.forEach(p => { nameToPid[p.name] = p.pid })
    const payload = matchups.map(m => ({
      category: m.category,
      challenge: m.challenge || '',
      highId: nameToPid[m.high],
      lowId: nameToPid[m.low],
      highRank: m.highRank,
      lowRank: m.lowRank,
      gap: m.gap
    }))
    try {
      const res = await fetch(`/api/games/${gameInfo.gameId}/matchups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: payload })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setSaved(true)
      setShareStatus('Saved — these matchups will run the game ✓')
    } catch (err) {
      setShareStatus(`Could not save: ${err.message}`)
    }
    setTimeout(() => setShareStatus(''), 4000)
  }

  // Schedule report card: challenges used per category, gap spread as a
  // small histogram, and which ranks appear anywhere in the schedule
  const reportCard = matchups && matchups.length > 0 && (() => {
    const used = {}
    for (const m of matchups) used[m.category] = (used[m.category] || 0) + 1

    const catEntries = gameInfo
      ? gameInfo.cats.map(c => ({ name: c.name, used: used[c.name] || 0, total: c.count }))
      : Object.entries(used).map(([name, u]) => ({ name, used: u, total: null }))

    const entries = matchups.filter(m => Number.isFinite(m.gap) && m.gap > 0)

    // Rank scale: category count when a game is loaded, else the largest
    // rank visible in a shared schedule
    const M = gameInfo
      ? gameInfo.categories.length
      : Math.max(2, ...matchups.flatMap(m => [m.highRank, m.lowRank]).filter(Number.isFinite))
    const maxGap = M - 1

    const gapCounts = {}
    for (const m of entries) gapCounts[m.gap] = (gapCounts[m.gap] || 0) + 1
    const tallest = Math.max(1, ...Object.values(gapCounts))

    const ranksUsed = new Set(entries.flatMap(m => [m.highRank, m.lowRank]))

    return (
      <div className="mm-report">
        <div className="mm-report-title">Schedule Report</div>

        <div className="report-row">
          <div className="report-label">Challenges used</div>
          <div className="report-value">
            {catEntries.map(c => (
              <span
                key={c.name}
                className={`rep-cat ${c.used === 0 ? 'unused' : ''}`}
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
        </div>

        {entries.length > 0 && (
          <div className="report-row">
            <div className="report-label">Gap spread</div>
            <div className="report-value">
              <div className="gap-bars">
                {Array.from({ length: maxGap }, (_, i) => i + 1).map(g => {
                  const count = gapCounts[g] || 0
                  return (
                    <div
                      key={g}
                      className={`gap-col ${count === 0 ? 'unused' : ''}`}
                      title={`${count} matchup${count === 1 ? '' : 's'} where the favorite outranks the underdog by ${g}${g === maxGap ? ' (the maximum possible)' : ''}`}
                    >
                      <div className="gap-count">{count || ''}</div>
                      <div className="gap-bar" style={{ height: `${6 + (count / tallest) * 30}px` }} />
                      <div className="gap-num">{g}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div className="report-row">
            <div className="report-label">Ranks in play</div>
            <div
              className="report-value"
              title="Which ranks appear somewhere in the schedule — touching both #1 and the bottom makes a more interesting night"
            >
              <span className="mm-rank-pips">
                {Array.from({ length: M }, (_, i) => (
                  <span key={i} className={`mm-rank-pip ${ranksUsed.has(i + 1) ? 'on' : ''}`}>{i + 1}</span>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  })()

  // In a running game, the table shows progress: played rows dim (✕ for a
  // no-contest), the earliest unresolved one gets the ▶ marker
  const playing = gameInfo && gameInfo.status === 'playing'
  const nextNumber = playing && matchups
    ? (matchups.find(m => !m.played && !m.skipped) || {}).number
    : null

  // Before the start, the challenge column is the page's one editable
  // field: name the actual challenge and it becomes the contest's title
  const editableNames = gameInfo && !playing && !isViewOnly
  const setChallenge = (number, value) => {
    setMatchups(rows => rows.map(r => r.number === number ? { ...r, challenge: value } : r))
    if (saved) setSavedPos(null) // the saved copy no longer matches
  }

  const matchupsTable = matchups && matchups.length > 0 && (
    <table className="mm-table">
      <thead>
        <tr><th>#</th><th>Category</th><th>Favorite</th><th>Underdog</th><th>Matchup</th><th>Challenge</th></tr>
      </thead>
      <tbody>
        {matchups.map((m) => {
          const done = playing && (m.played || m.skipped)
          const next = playing && m.number === nextNumber
          return (
            <tr key={m.number} className={done ? 'mm-done' : next ? 'mm-next' : ''}>
              <td>{m.skipped ? '✕' : next ? '▶' : m.number}</td>
              <td>{m.category}</td>
              <td className="mm-fav">{m.high}</td>
              <td>{m.low}</td>
              <td>{m.matchup}</td>
              <td>
                {editableNames ? (
                  <input
                    className="mm-challenge-input"
                    type="text"
                    maxLength={80}
                    placeholder="name it…"
                    value={m.challenge || ''}
                    onChange={e => setChallenge(m.number, e.target.value)}
                  />
                ) : (
                  <span className="mm-challenge">{m.challenge || '–'}</span>
                )}
              </td>
            </tr>
          )
        })}
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
            {reportCard}
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
            <h1 className="mm-title">{playing ? "Tonight's Matchups" : `Game ${gameInfo.gameId}`}</h1>
            <p className="mm-note">
              {playing
                ? `Game ${gameInfo.gameId} · ${matchups ? matchups.filter(m => m.played || m.skipped).length : 0} of ${matchups ? matchups.length : 0} played · reload to see progress`
                : `${gameInfo.players.length} ranked player${gameInfo.players.length === 1 ? '' : 's'} · ${gameInfo.cats.reduce((s, c) => s + c.count, 0)} challenges · reload to pick up new rankings`}
            </p>

            {!playing && (
              <div className="mm-shuffle">
                {schedules.list.length > 1 && (
                  <button
                    className="mm-step"
                    onClick={() => showSchedule(schedules.pos - 1)}
                    disabled={schedules.pos === 0 || !!solveStatus}
                    aria-label="Previous schedule"
                  >‹</button>
                )}
                <button className="mega-btn violet" onClick={makeMatches} disabled={!!solveStatus}>
                  {solveStatus || (matchups ? 'RESHUFFLE ★' : 'MAKE MATCHES ★')}
                </button>
                {schedules.list.length > 1 && (
                  <button
                    className="mm-step"
                    onClick={() => showSchedule(schedules.pos + 1)}
                    disabled={schedules.pos === schedules.list.length - 1 || !!solveStatus}
                    aria-label="Next schedule"
                  >›</button>
                )}
              </div>
            )}
            {!playing && schedules.list.length > 1 && (
              <div className="mm-step-note">
                Schedule {schedules.pos + 1} of {schedules.list.length}
                {savedPos !== null && !saved ? ` · #${savedPos + 1} is saved` : ''}
              </div>
            )}

            {solveError && <div className="mm-error">{solveError}</div>}

            {reportCard}
            {matchupsTable}

            {!playing && matchups && matchups.length > 0 && (
              <div className="mm-share">
                <button className="mega-btn" onClick={saveMatchups} disabled={saved}>
                  {saved ? 'MATCHUPS SAVED ✓' : 'SAVE MATCHUPS ★'}
                </button>
                {shareStatus && <div className="mm-share-status">{shareStatus}</div>}
                {saved && !shareStatus && (
                  <div className="mm-share-status">These matchups will run the game — reshuffle any time before the start</div>
                )}
              </div>
            )}

            <details className="game-details">
              <summary>Rankings matrix</summary>
              <div className="mm-matrix-wrap">
                <table className="mm-matrix">
                  <thead>
                    <tr>
                      <th></th>
                      {gameInfo.categories.map(c => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {gameInfo.players.map(p => (
                      <tr key={p.pid}>
                        <td className="mx-player"><Avatar pid={p.pid} playerAvatars={gameInfo.playerAvatars} /> {p.name}</td>
                        {gameInfo.categories.map(c => {
                          const r = p.ranks[c]
                          const cls = r === 1 ? 'top' : r === gameInfo.categories.length ? 'bottom' : ''
                          return <td key={c} className={`mx-rank ${cls}`}>{r}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}

export default Matchmaker
