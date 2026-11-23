import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import RulesPanel from './RulesPanel'
import { avatarFor } from '../lib/avatars'
import './GameBoard.css'

function GameBoard() {
  const { gameId, playerId: urlPlayerId } = useParams()
  const navigate = useNavigate()
  const [selectedOption, setSelectedOption] = useState(null)
  const [userChoice, setUserChoice] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [hasResolutionSelected, setHasResolutionSelected] = useState(false)
  const [cancelConfirmationActive, setCancelConfirmationActive] = useState(false)
  const {
    gameState,
    players,
    playerPoints,
    playerNames,
    playerWagerCount,
    playerId,
    isHost,
    wagerOptions,
    wagerContestants,
    wagerActive,
    playerChoices,
    wagerResolved,
    wagerResults,
    proposeWager,
    makeChoice,
    resolveWager,
    cancelWager,
    resetWagerState,
    error,
    socket,
    categories,
    challengesPerCategory,
    playerRankings,
    rankingsComplete,
    wagerCategory
  } = useGame()

  useEffect(() => {
    // If game is not playing, redirect to lobby
    if (gameState && gameState.status !== 'playing') {
      navigate(`/lobby/${gameId}`)
    }
  }, [gameState, gameId, navigate])

  // Reset selection state when wager state changes
  useEffect(() => {
    if (!wagerActive) {
      setSelectedOption(null)
      setUserChoice(null)
      setHasResolutionSelected(false)
      setCancelConfirmationActive(false)
    }
  }, [wagerActive])

  // Handle cancel button clicks (two taps to confirm)
  const handleCancelClick = () => {
    if (cancelConfirmationActive) {
      cancelWager()
      setCancelConfirmationActive(false)
    } else {
      setCancelConfirmationActive(true)
    }
  }

  useEffect(() => {
    if (hasResolutionSelected) {
      setCancelConfirmationActive(false)
    }
  }, [hasResolutionSelected])

  // Auto-reset cancel confirmation after 5 seconds
  useEffect(() => {
    if (cancelConfirmationActive) {
      const timeout = setTimeout(() => setCancelConfirmationActive(false), 5000)
      return () => clearTimeout(timeout)
    }
  }, [cancelConfirmationActive])

  // Monitor connection status
  useEffect(() => {
    if (!socket) return

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [socket])

  // Bounty preview shown to contestants while a wager is active.
  // (After resolution, the authoritative amount arrives in wagerResults.)
  const bountyPreview = (() => {
    if (!wagerActive || !gameState || !gameState.bounty || gameState.bounty === 'None') return null
    if (!wagerContestants.includes(playerId)) return null
    const allBets = Object.values(playerChoices).map(c => c.points).filter(p => p > 0)
    if (allBets.length === 0) return null
    switch (gameState.bounty) {
      case 'Fixed': return gameState.bountyAmount || 0
      case 'Min': return Math.min(...allBets)
      case 'Max': return Math.max(...allBets)
      case 'Average': return Math.floor(allBets.reduce((s, b) => s + b, 0) / allBets.length)
      default: return null
    }
  })()

  if (!gameState || gameState.status !== 'playing') {
    return (
      <div className="game-board">
        <div className="stage-content">
          <h2>Loading game...</h2>
        </div>
      </div>
    )
  }

  const contestNumber = Math.floor(
    Object.values(playerWagerCount || {}).reduce((s, c) => s + c, 0) / 2
  ) + 1

  const myBet = playerChoices[playerId]
  const betsIn = Object.keys(playerChoices).length
  // An emcee host runs the game without being a player: no betting UI
  const amPlayer = players.includes(playerId)

  // Leaderboard, sorted by points
  const standings = players
    .map(pid => ({
      id: pid,
      name: playerNames[pid] || 'Unknown Player',
      points: playerPoints[pid] !== undefined ? playerPoints[pid] : 0,
      isMe: pid === playerId
    }))
    .sort((a, b) => b.points - a.points)

  return (
    <div className="game-board">
      <div className="stage-content">

        {/* ---- No active wager: host sets up the next contest ---- */}
        {!wagerActive && !wagerResolved && (
          <div className="contest-area">
            <div className="round-strip">Contest {contestNumber}</div>
            {isHost ? (
              <>
                <div className="category-title">Set Up the Contest</div>
                <WagerProposalForm onSubmit={proposeWager} />
              </>
            ) : (
              <>
                <div className="category-title">Get Ready…</div>
                <p className="waiting-line">The host is setting up the next contest 🎲</p>
              </>
            )}
          </div>
        )}

        {/* ---- Active wager: the duel ---- */}
        {wagerActive && (() => {
          const odds0 = wagerOptions.odds[0] || 1
          const odds1 = wagerOptions.odds[1] || 1

          // Lower odds on the left
          const sorted = [
            { name: wagerOptions.options[0], odds: odds0, idx: 0 },
            { name: wagerOptions.options[1], odds: odds1, idx: 1 }
          ].sort((a, b) => a.odds - b.odds)

          const isPlayerInContest = wagerContestants.includes(playerId)
          const canBetOn = (idx) => !isPlayerInContest || wagerContestants[idx] === playerId

          const tagFor = (f, other) =>
            f.odds === other.odds ? 'Even odds' : (f.odds < other.odds ? 'Favorite' : 'Underdog')

          const rankFor = (idx) => {
            if (!wagerCategory || !playerRankings) return null
            const pid = wagerContestants[idx]
            return (pid && playerRankings[pid]?.[wagerCategory]) || null
          }

          const fighter = (f, other, side) => (
            <button
              key={side}
              className={[
                'fighter', side,
                selectedOption === f.idx || (myBet && userChoice === f.idx) ? 'picked' : '',
                !amPlayer ? 'spectator' : (!canBetOn(f.idx) || myBet ? 'locked' : '')
              ].join(' ')}
              onClick={() => { if (amPlayer && !myBet && canBetOn(f.idx)) setSelectedOption(f.idx) }}
            >
              <span className="avatar">{avatarFor(wagerContestants[f.idx] || f.name)}</span>
              <span className="fighter-name">{f.name}</span>
              <span className={`fighter-tag ${f.odds === other.odds ? 'even' : (f.odds < other.odds ? 'favorite' : 'underdog')}`}>
                {tagFor(f, other)}
              </span>
              <span className="fighter-odds">{f.odds}× <span className="odds-word">payout</span></span>
              {rankFor(f.idx) ? <span className="fighter-rank">Rank {rankFor(f.idx)}</span> : null}
            </button>
          )

          return (
            <div className="contest-area">
              <div className="round-strip">Contest {contestNumber}</div>
              <div className="category-title">{wagerCategory || 'Who Wins?'}</div>

              <div className="duel">
                {fighter(sorted[0], sorted[1], 'left')}
                <div className="vs-badge">VS</div>
                {fighter(sorted[1], sorted[0], 'right')}
              </div>

              {amPlayer && !myBet && (
                <ChipBetForm
                  selectedName={selectedOption !== null ? wagerOptions.options[selectedOption] : null}
                  currentPoints={playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0}
                  minBalance={gameState?.minBalance || 0}
                  maxBetSize={gameState?.maxBetSize}
                  onSubmit={(points) => {
                    makeChoice(selectedOption, points)
                    setUserChoice(selectedOption)
                    setSelectedOption(null)
                  }}
                />
              )}

              {myBet && (() => {
                const myChoice = userChoice !== null ? userChoice : myBet.choice
                const name = myChoice !== null && myChoice !== undefined
                  ? wagerOptions.options[myChoice]
                  : null
                return (
                  <div className="bet-locked">
                    ✓ You bet <b>{myBet.points}</b>{name ? <> on <b>{name}</b></> : null} — locked in!
                  </div>
                )
              })()}

              {bountyPreview ? (
                <div className="bounty-line">💰 Bounty for the winner: <b>{bountyPreview}</b> points</div>
              ) : null}

              {/* One chip per player, leader first: stack in dim mono, bet in gold */}
              <div className="bet-chips">
                {standings.map((p, i) => {
                  const c = playerChoices[p.id]
                  const secret = wagerContestants.includes(p.id)
                  return (
                    <span key={p.id} className={`bet-chip ${c ? 'placed' : 'waiting'}`}>
                      {i === 0 ? <span className="bet-chip-crown">🏆</span> : null}
                      <span className="bet-chip-avatar">{avatarFor(p.id)}</span>
                      <span className="bet-chip-name">{p.name}</span>
                      <span className="bet-chip-points">{p.points}</span>
                      {c ? <span className="bet-chip-amount">▸ {secret ? '??' : (c.points || 0)}</span> : null}
                    </span>
                  )
                })}
              </div>

              {isHost && betsIn > 0 && (
                <div className="host-resolve">
                  <div className="resolve-title">Who won?</div>
                  <WagerResolutionForm
                    onSubmit={resolveWager}
                    wagerOptions={wagerOptions}
                    onSelectionChange={setHasResolutionSelected}
                  />
                  <button
                    onClick={handleCancelClick}
                    className={`cancel-btn ${cancelConfirmationActive ? 'danger' : ''}`}
                    disabled={hasResolutionSelected}
                  >
                    {cancelConfirmationActive ? 'Confirm cancel?' : 'Cancel contest'}
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* ---- Resolved: results ---- */}
        {wagerResolved && wagerResults && (
          <div className="contest-area">
            <div className="round-strip">Result</div>
            <div className="category-title winner-title">
              {playerNames[wagerResults.winnerPlayerId] || 'Winner'} WINS!
            </div>
            <div className="winner-sub">
              @ {wagerOptions.odds?.[wagerResults.correctChoice] || 1}:1
              {wagerResults.bountyAmount > 0 && <> &nbsp;+{wagerResults.bountyAmount} bounty 💰</>}
            </div>

            <div className="results-board">
              <div className="board-row head">
                <span className="board-rank"></span>
                <span className="board-name"></span>
                <span className="board-delta">Round</span>
                <span className="board-total">Total</span>
              </div>
              {standings.map((p, i) => {
                const r = wagerResults.results.find(x => x.playerId === p.id)
                const gotBounty = p.id === wagerResults.winnerPlayerId && wagerResults.bountyAmount > 0
                let delta = r ? parseInt(r.pointsChange) : 0
                if (gotBounty) delta += wagerResults.bountyAmount
                const active = !!r || gotBounty
                const deltaClass = !active ? 'none' : delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'even'
                return (
                  <div key={p.id} className={`board-row ${p.isMe ? 'me' : ''}`}>
                    <span className="board-rank">{i === 0 ? '🏆' : `#${i + 1}`}</span>
                    <span className="board-name">{avatarFor(p.id)} {p.name}</span>
                    <span className={`board-delta ${deltaClass}`}>
                      {active ? (delta > 0 ? `+${delta}` : `${delta}`) : '–'}
                    </span>
                    <span className="board-total">{p.points}</span>
                  </div>
                )
              })}
            </div>

            {isHost && (
              <button onClick={resetWagerState} className="btn btn-primary next-contest-btn">
                NEXT CONTEST ★
              </button>
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {/* ---- Score ticker (hidden during contests, where the bet chips carry
             the standings, and on results, which show the full board) ---- */}
        {!wagerActive && !(wagerResolved && wagerResults) && (
          <div className="score-ticker">
            {standings.map((p, i) => (
              <span key={p.id} className={`tick ${p.isMe ? 'me' : ''} ${i === 0 ? 'lead' : ''}`}>
                {i === 0 ? '🏆 ' : ''}<span className="tick-name">{p.name}</span> {p.points}
              </span>
            ))}
          </div>
        )}

        {/* ---- Collapsed game info ---- */}
        <details className="game-details">
          <summary>Game info & rankings</summary>
          <RulesPanel
            gameState={gameState}
            playerWagerCount={playerWagerCount}
            categories={categories}
          />
          {categories && categories.length > 0 && rankingsComplete && (
            <div className="rankings-grid">
              {players.map(pid => (
                <div key={pid} className="player-ranking-card">
                  <h4>{avatarFor(pid)} {playerNames[pid] || 'Unknown Player'}</h4>
                  <div className="ranking-items">
                    {categories
                      .map(category => ({ category, rank: playerRankings[pid]?.[category] || 999 }))
                      .sort((a, b) => a.rank - b.rank)
                      .map(({ category, rank }) => (
                        <div key={category} className="ranking-item">
                          <span className="rank-value">#{rank === 999 ? '–' : rank}</span>
                          <span className="category-name"> {category}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              {isHost && (
                <a
                  href={`/matchmaker?game=${gameId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Matchmaker
                </a>
              )}
            </div>
          )}
        </details>

        <div className="stage-footer">
          <span>Game {gameId}</span>
          <span className={isConnected ? 'connected' : 'disconnected'}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>
    </div>
  )
}

// Additive chip betting: chips stack (5 then 10 = 15), clamped at the max
function ChipBetForm({ selectedName, currentPoints, minBalance, maxBetSize, onSubmit }) {
  const [bet, setBet] = useState(0)

  // Players can never bet more than their balance (optionally clamped by the
  // game's maximum bet size)
  let maxWager = currentPoints
  if (maxBetSize !== null && maxBetSize !== undefined) {
    maxWager = Math.min(maxWager, maxBetSize)
  }

  const addChip = (value) => setBet(b => Math.min(maxWager, b + value))

  const canPlace = selectedName !== null && bet > 0 && bet <= maxWager

  // Losses are clamped at the minimum balance floor, so only the part of the
  // bet above the floor is actually at risk
  const atRisk = bet > 0 ? Math.min(bet, Math.max(0, currentPoints - minBalance)) : null

  const ctaLabel = selectedName === null
    ? 'PICK A SIDE'
    : bet === 0
      ? 'ADD CHIPS'
      : `BET ${bet} ON ${selectedName.toUpperCase()} ★`

  return (
    <div className="chip-bet">
      <div className="chip-row">
        {[5, 10, 25, 50].map(v => (
          <button
            key={v}
            className="chip"
            disabled={bet >= maxWager}
            onClick={() => addChip(v)}
          >
            +{v}
          </button>
        ))}
        <button className="chip all" disabled={maxWager === 0} onClick={() => setBet(maxWager)}>ALL</button>
        <button className="chip clear" disabled={bet === 0} onClick={() => setBet(0)}>✕</button>
      </div>

      <button
        className="place-bet"
        disabled={!canPlace}
        onClick={() => { onSubmit(bet); setBet(0) }}
      >
        {ctaLabel}
      </button>

      {atRisk !== null && (
        <div className="risk-line">
          {atRisk === 0
            ? 'Risk-free: you are at the minimum balance, a loss costs nothing'
            : atRisk < bet
              ? `At risk: ${atRisk} of ${bet} (losses stop at the minimum balance of ${minBalance})`
              : `At risk: ${bet} of your ${currentPoints}`}
        </div>
      )}
    </div>
  )
}

// Host sets up the contest: tap a category pill, tap two player cards,
// dial the odds, go.
function WagerProposalForm({ onSubmit }) {
  const { players, playerNames, playerWagerCount, categories, playerRankings, rankingsComplete } = useGame()
  const [picked, setPicked] = useState([]) // up to two playerIDs
  const [dogOdds, setDogOdds] = useState(1) // the underdog's multiplier (favorite is pegged at 1x)
  const [swapped, setSwapped] = useState(false) // manual side swap when ranks don't decide
  const [selectedCategory, setSelectedCategory] = useState('')

  const hasCategories = categories && categories.length > 0 && rankingsComplete

  const togglePick = (pid) => {
    setSwapped(false)
    setPicked(prev => {
      if (prev.includes(pid)) return prev.filter(p => p !== pid)
      if (prev.length < 2) return [...prev, pid]
      return [prev[1], pid] // already two: swap out the older pick
    })
  }

  const rankOf = (pid) =>
    (selectedCategory && playerRankings[pid] && playerRankings[pid][selectedCategory]) || null

  // Preview order: favorite on the left, pegged at 1x. With differing
  // category ranks the better rank IS the favorite; otherwise pick order
  // decides and the host can swap the sides manually.
  const orderedPick = (() => {
    if (picked.length < 2) return picked
    const [a, b] = picked
    const ra = rankOf(a), rb = rankOf(b)
    if (ra && rb && ra !== rb) return ra < rb ? [a, b] : [b, a]
    return swapped ? [b, a] : [a, b]
  })()

  const [favId, dogId] = orderedPick
  const rankBasedRoles = picked.length === 2 &&
    rankOf(favId) && rankOf(dogId) && rankOf(favId) !== rankOf(dogId)

  const stepDogOdds = (delta) =>
    setDogOdds(current => Math.min(10, Math.max(1, Math.round((current + delta) * 2) / 2)))

  // Grid sorted by rank in the selected category, else by games played
  const grid = players
    .map(pid => {
      const name = playerNames[pid]
      const wagerCount = playerWagerCount[pid] || 0
      const categoryRank = selectedCategory && playerRankings[pid] ? playerRankings[pid][selectedCategory] : null
      return { pid, name, wagerCount, categoryRank }
    })
    .filter(player => player.name && player.name.trim())
    .sort((a, b) => {
      if (selectedCategory && a.categoryRank && b.categoryRank) {
        if (a.categoryRank !== b.categoryRank) {
          return a.categoryRank - b.categoryRank
        }
      }
      if (!selectedCategory) {
        if (a.wagerCount !== b.wagerCount) {
          return a.wagerCount - b.wagerCount
        }
      }
      return a.name.localeCompare(b.name)
    })

  const ready = picked.length === 2

  const handleStart = () => {
    if (!ready) return
    // Submit favorite-first (pegged at 1x) so the live cards match the preview
    onSubmit(favId, dogId, 1, dogOdds, selectedCategory)
    setPicked([])
    setDogOdds(1)
    setSwapped(false)
    setSelectedCategory('')
  }

  return (
    <div className="contest-setup">
      {hasCategories && (
        <div className="cat-pills">
          <button
            type="button"
            className={`cat-pill ${selectedCategory === '' ? 'on' : ''}`}
            onClick={() => setSelectedCategory('')}
          >
            None
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              className={`cat-pill ${selectedCategory === category ? 'on' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className="mini-grid">
        {grid.map((player) => (
          <button
            type="button"
            key={player.pid}
            className={`mini-card ${picked.includes(player.pid) ? 'picked' : ''}`}
            onClick={() => togglePick(player.pid)}
          >
            <span className="mini-avatar">{avatarFor(player.pid)}</span>
            <span className="mini-name">{player.name}</span>
            <span className="mini-meta">
              {selectedCategory && player.categoryRank ? `Rank ${player.categoryRank} · ` : ''}
              Played {player.wagerCount}
            </span>
          </button>
        ))}
      </div>

      {ready && (() => {
        const even = !rankBasedRoles && dogOdds === 1

        const nameOf = (pid) => (
          <div className="preview-name">
            {avatarFor(pid)} {playerNames[pid]}
            {rankOf(pid) && <span className="preview-rank">Rank {rankOf(pid)}</span>}
          </div>
        )

        return (
          <div className="setup-preview">
            <div className="preview-side">
              <div className="preview-tag">{even ? 'Even' : 'Favorite'}</div>
              {nameOf(favId)}
              <div className="odds-fixed">1×</div>
            </div>

            <div className="vs-stack">
              <div className="vs-mini">VS</div>
              {!rankBasedRoles && (
                <button
                  type="button"
                  className="swap-btn"
                  title="Swap the sides"
                  onClick={() => setSwapped(s => !s)}
                >
                  ⇄
                </button>
              )}
            </div>

            <div className="preview-side">
              <div className="preview-tag">{even ? 'Even' : 'Underdog'}</div>
              {nameOf(dogId)}
              <div className="odds-stepper">
                <button type="button" onClick={() => stepDogOdds(-0.5)} disabled={dogOdds <= 1}>−</button>
                <span>{dogOdds}×</span>
                <button type="button" onClick={() => stepDogOdds(0.5)} disabled={dogOdds >= 10}>+</button>
              </div>
            </div>
          </div>
        )
      })()}

      <button className="place-bet propose" disabled={!ready} onClick={handleStart}>
        {ready ? 'START THE CONTEST ★' : 'PICK TWO PLAYERS'}
      </button>
    </div>
  )
}

// Wager Resolution Form Component (host picks the winner)
function WagerResolutionForm({ onSubmit, wagerOptions, onSelectionChange }) {
  const [correctChoice, setCorrectChoice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (correctChoice !== '') {
      onSubmit(parseInt(correctChoice))
    }
  }

  const handleOptionClick = (option) => {
    const newChoice = correctChoice === option ? '' : option
    setCorrectChoice(newChoice)
    if (onSelectionChange) {
      onSelectionChange(newChoice !== '')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="resolution-form">
      <div className="resolution-options">
        <button
          type="button"
          className={`resolve-pick ${correctChoice === '0' ? 'picked' : ''}`}
          onClick={() => handleOptionClick('0')}
        >
          {wagerOptions.options[0]}
        </button>
        <button
          type="button"
          className={`resolve-pick ${correctChoice === '1' ? 'picked' : ''}`}
          onClick={() => handleOptionClick('1')}
        >
          {wagerOptions.options[1]}
        </button>
      </div>
      <button type="submit" className="place-bet resolve" disabled={correctChoice === ''}>
        RESOLVE CONTEST
      </button>
    </form>
  )
}

export default GameBoard
