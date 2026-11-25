import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import RulesPanel from './RulesPanel'
import GameLobby from './GameLobby'
import { avatarFor } from '../lib/avatars'
import { rankPlayers, positionsBefore, roundChange, statsFor } from '../lib/standings'
import './GameBoard.css'

// spectator: the presentation (TV) screen at /tv/:gameId — the same stage
// the players see, watched without a seat, so every player- and
// host-specific control simply drops away (no playerId, not host).
function GameBoard({ spectator = false }) {
  const { gameId } = useParams()
  const [selectedOption, setSelectedOption] = useState(null)
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
    proposeWager,
    makeChoice,
    resolveWager,
    cancelWager,
    lockBets,
    dismissResult,
    nextMatchup,
    finishGame,
    skipMatchup,
    error,
    socket,
    categories,
    challengesPerCategory,
    playerRankings,
    rankingsComplete
  } = useGame()

  // The current contest, straight from game state: none between contests;
  // live (taking bets, then awaiting a winner) until it has a result; then
  // the Result screen until the host moves on
  const contest = gameState?.contest || null
  const result = contest?.result || null
  const live = !!contest && !result
  const bets = contest?.bets || {}
  const contestants = contest?.contestants || []
  const options = contest?.options || []
  const odds = contest?.odds || [1, 1]
  const betsLockAt = live ? contest.betsLockAt : null

  // Tick while a bet-lock countdown is running so the remaining seconds
  // (and the flip to "locked") render without any server round trip
  const [lockNow, setLockNow] = useState(Date.now())
  useEffect(() => {
    if (!betsLockAt || Date.now() >= betsLockAt + 1000) return
    const tick = setInterval(() => {
      setLockNow(Date.now())
      if (Date.now() >= betsLockAt + 1000) clearInterval(tick)
    }, 250)
    return () => clearInterval(tick)
  }, [betsLockAt])
  const betsLocked = !!betsLockAt && lockNow >= betsLockAt
  const lockSecondsLeft = betsLockAt && !betsLocked
    ? Math.max(0, Math.ceil((betsLockAt - lockNow) / 1000))
    : null

  // Reset local selection state whenever the contest changes or resolves
  const contestKey = contest ? `${contest.id}|${result ? 'done' : 'live'}` : ''
  useEffect(() => {
    setSelectedOption(null)
    setHasResolutionSelected(false)
    setCancelConfirmationActive(false)
  }, [contestKey])

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

  // The schedule's order never changes; per-matchup played/skipped flags
  // track progress, and the host browses unresolved matchups with ‹ ›,
  // starting whichever one is in view. (Derived before the loading return
  // below so the hooks always run — hooks must be unconditional.)
  const schedule = Array.isArray(gameState?.matchups) ? gameState.matchups : []
  const openMatchups = schedule.filter(m => !m.played && !m.skipped)
  const [viewPos, setViewPos] = useState(0)
  const safePos = Math.min(viewPos, Math.max(0, openMatchups.length - 1))
  const viewed = openMatchups[safePos] || null

  // Whenever the set of unresolved matchups changes (a resolution or a
  // skip), return to the earliest unresolved one
  useEffect(() => {
    setViewPos(0)
  }, [openMatchups.length])

  // Host sets the underdog's odds before the contest goes live; the rank
  // gap provides the starting suggestion (favorite stays 1x)
  const defaultDogOdds = viewed
    ? Math.min(4, 1 + 0.5 * Math.max(1, viewed.gap || 1))
    : 2
  const [nextDogOdds, setNextDogOdds] = useState(defaultDogOdds)
  const [skipConfirm, setSkipConfirm] = useState(false)
  const viewedKey = viewed ? viewed.number : 'none'
  useEffect(() => {
    setNextDogOdds(defaultDogOdds)
    setSkipConfirm(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedKey, schedule.length])
  useEffect(() => {
    if (!skipConfirm) return
    const t = setTimeout(() => setSkipConfirm(false), 4000)
    return () => clearTimeout(t)
  }, [skipConfirm])

  // Bounty preview, shown to contestants while a contest is live: the
  // server keeps contest.bounty current as bets arrive
  const bountyPreview = live && contestants.includes(playerId) && contest.bounty > 0
    ? contest.bounty
    : null

  // Before the start, this same URL shows the lobby (the TV watches it
  // without a seat): one link per player for the whole night
  if (gameState && gameState.status === 'waiting') {
    return <GameLobby spectator={spectator} />
  }

  if (!gameState || (gameState.status !== 'playing' && gameState.status !== 'finished')) {
    return (
      <div className="game-board">
        <div className="stage-content">
          <h2>Loading game...</h2>
        </div>
      </div>
    )
  }

  const contestLabel = schedule.length > 0
    ? `Matchup ${live && contest.number
        ? contest.number
        : viewed
          ? viewed.number
          : schedule.length} of ${schedule.length}`
    : `Contest ${Math.floor(
        Object.values(playerWagerCount || {}).reduce((s, c) => s + c, 0) / 2
      ) + 1}`

  const finished = gameState?.status === 'finished'
  const myBet = bets[playerId]
  // An emcee host runs the game without being a player: no betting UI
  const amPlayer = players.includes(playerId)

  // Leaderboard order, ties broken the same way everywhere (lib/standings)
  const standings = rankPlayers(
    players.map(pid => ({
      id: pid,
      name: playerNames[pid] || 'Unknown Player',
      points: playerPoints[pid] !== undefined ? playerPoints[pid] : 0,
      isMe: pid === playerId
    })),
    gameState?.stats
  )
  // Everyone level at the top is a champion; the podium is #2 and #3
  const champions = standings.filter(p => p.position === 1)
  const podium = standings.filter(p => p.position === 2 || p.position === 3)

  return (
    <div className="game-board">
      <div className="stage-content">

        {/* ---- Finished: the Winner screen ---- */}
        {finished && (
          <div className="winner-screen">
            <div className="round-strip">Final Result</div>

            {champions.length > 0 && (
              <div className="champ-banner">
                <span className="champ-avatar">{champions.map(p => avatarFor(p.id)).join(' ')}</span>
                <div className="champ-label">
                  {champions.length > 1 ? "Tonight's Champions" : "Tonight's Champion"}
                </div>
                <div className="champ-name">{champions.map(p => p.name).join(' & ')}</div>
                <div className="champ-points">{champions[0].points} points</div>
              </div>
            )}

            {podium.length > 0 && (
              <div className="podium">
                {podium.map(p => (
                  <div key={p.id} className={`podium-step ${p.position === 2 ? 'second' : 'third'}`}>
                    <span className="podium-avatar">{avatarFor(p.id)}</span>
                    <div className="podium-name">{p.name}</div>
                    <div className="podium-block">
                      <span className="podium-medal">{p.position === 2 ? '🥈' : '🥉'}</span>
                      <span className="podium-points">{p.points}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <StandingsTable standings={standings} stats={gameState?.stats} />
          </div>
        )}

        {/* ---- Between contests: the host advances the show ---- */}
        {!finished && !contest && (
          <div className="contest-area">
            <div className="round-strip">{schedule.length > 0 && !viewed ? 'Bonus Round' : contestLabel}</div>
            {isHost ? (
              viewed ? (
                <>
                  <div className="matchup-nav">
                    <button
                      className="nav-arrow"
                      onClick={() => setViewPos(p => Math.max(0, p - 1))}
                      disabled={safePos === 0}
                      aria-label="Previous matchup"
                    >‹</button>
                    <div className="matchup-nav-body">
                      <div className="category-title">{viewed.challenge || viewed.category}</div>
                      {viewed.challenge ? <div className="category-sub">{viewed.category}</div> : null}
                      <p className="next-teaser">
                        <b>{playerNames[viewed.highId] || '?'}</b>
                        <span className="teaser-rank">rank {viewed.highRank}</span>
                        {' vs '}
                        <b>{playerNames[viewed.lowId] || '?'}</b>
                        <span className="teaser-rank">rank {viewed.lowRank}</span>
                      </p>
                    </div>
                    <button
                      className="nav-arrow"
                      onClick={() => setViewPos(p => Math.min(openMatchups.length - 1, p + 1))}
                      disabled={safePos >= openMatchups.length - 1}
                      aria-label="Next matchup"
                    >›</button>
                  </div>
                  <div className="pre-odds">
                    <span className="pre-odds-label">
                      {playerNames[viewed.lowId] || 'Underdog'} pays
                    </span>
                    <div className="odds-stepper">
                      <button
                        type="button"
                        onClick={() => setNextDogOdds(o => Math.max(1, +(o - 0.5).toFixed(1)))}
                        disabled={nextDogOdds <= 1}
                      >−</button>
                      <span>{nextDogOdds}×</span>
                      <button
                        type="button"
                        onClick={() => setNextDogOdds(o => Math.min(10, +(o + 0.5).toFixed(1)))}
                        disabled={nextDogOdds >= 10}
                      >+</button>
                    </div>
                    <span className="pre-odds-hint">
                      Rank gap suggests {defaultDogOdds}× · {playerNames[viewed.highId] || 'Favorite'} pays 1×
                    </span>
                  </div>
                  <button className="mega-btn" onClick={() => nextMatchup(viewed.number, nextDogOdds)}>
                    START THE CONTEST ★
                  </button>
                  <div className="pre-contest-tools">
                    <button
                      onClick={() => {
                        if (skipConfirm) { setSkipConfirm(false); skipMatchup(viewed.number) }
                        else setSkipConfirm(true)
                      }}
                      className={`cancel-btn ${skipConfirm ? 'danger' : ''}`}
                    >
                      {skipConfirm ? 'Skip this matchup — sure?' : 'Declare no contest'}
                    </button>
                  </div>
                </>
              ) : schedule.length > 0 ? (
                <>
                  <div className="category-title">That's the Show!</div>
                  <p className="waiting-line">All scheduled matchups are played 🎉</p>
                  <button className="mega-btn" onClick={finishGame}>
                    FINISH GAME ★
                  </button>
                </>
              ) : (
                <>
                  <div className="category-title">Set Up the Contest</div>
                  <WagerProposalForm onSubmit={proposeWager} />
                </>
              )
            ) : (
              <>
                <div className="category-title">Get Ready…</div>
                <p className="waiting-line">The host is setting up the next contest 🎲</p>
              </>
            )}
          </div>
        )}

        {/* ---- Live contest: the duel ---- */}
        {!finished && live && (() => {
          const odds0 = odds[0] || 1
          const odds1 = odds[1] || 1
          const category = contest.category
          const challenge = contest.challenge

          // Lower odds on the left
          const sorted = [
            { name: options[0], odds: odds0, idx: 0 },
            { name: options[1], odds: odds1, idx: 1 }
          ].sort((a, b) => a.odds - b.odds)

          const isPlayerInContest = contestants.includes(playerId)
          const canBetOn = (idx) => !isPlayerInContest || contestants[idx] === playerId

          const tagFor = (f, other) =>
            f.odds === other.odds ? 'Even odds' : (f.odds < other.odds ? 'Favorite' : 'Underdog')

          const rankFor = (idx) => {
            if (!category || !playerRankings) return null
            const pid = contestants[idx]
            return (pid && playerRankings[pid]?.[category]) || null
          }

          const fighter = (f, other, side) => (
            <button
              key={side}
              className={[
                'fighter', side,
                selectedOption === f.idx || (myBet && myBet.choice === f.idx) ? 'picked' : '',
                !amPlayer ? 'spectator' : (!canBetOn(f.idx) || myBet ? 'locked' : '')
              ].join(' ')}
              onClick={() => { if (amPlayer && !myBet && canBetOn(f.idx)) setSelectedOption(f.idx) }}
            >
              <span className="avatar">{avatarFor(contestants[f.idx] || f.name)}</span>
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
              <div className="round-strip">{contestLabel}</div>
              <div className="category-title">{challenge || category || 'Who Wins?'}</div>
              {challenge && category ? (
                <div className="category-sub">{category}</div>
              ) : null}

              {/* One chip per player, leader first: who's bet, who's still
                  deciding — betting progress at the top of the stage */}
              <div className="bet-chips">
                {standings.map((p) => {
                  // Everyone receives every bet; contestants' amounts are
                  // hidden here, by design, to keep the tension
                  const c = bets[p.id]
                  const secret = contestants.includes(p.id)
                  return (
                    <span key={p.id} className={`bet-chip ${c ? 'placed' : 'waiting'}`}>
                      {p.position === 1 ? <span className="bet-chip-crown">🏆</span> : null}
                      <span className="bet-chip-avatar">{avatarFor(p.id)}</span>
                      <span className="bet-chip-name">{p.name}</span>
                      <span className="bet-chip-points">{p.points}</span>
                      {c ? <span className="bet-chip-amount">▸ {secret ? '??' : (c.points || 0)}</span> : null}
                    </span>
                  )
                })}
              </div>

              <div className="duel">
                {fighter(sorted[0], sorted[1], 'left')}
                <div className="vs-badge">VS</div>
                {fighter(sorted[1], sorted[0], 'right')}
              </div>

              {/* Last-chance countdown for players who haven't bet yet */}
              {amPlayer && !myBet && betsLockAt && !betsLocked && (
                <div className="lock-countdown">
                  <span className="lock-count-num">{lockSecondsLeft}</span>
                  <span className="lock-count-label">Last chance to bet!</span>
                </div>
              )}

              {amPlayer && !myBet && betsLocked && (
                <div className="lock-closed-note">🔒 Betting closed — you sat this one out</div>
              )}

              {amPlayer && !myBet && !betsLocked && (
                <ChipBetForm
                  selectedName={selectedOption !== null ? options[selectedOption] : null}
                  currentPoints={playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0}
                  minBalance={gameState?.minBalance || 0}
                  maxBetSize={gameState?.maxBetSize}
                  onSubmit={(points) => {
                    makeChoice(selectedOption, points)
                    setSelectedOption(null)
                  }}
                />
              )}

              {myBet && (
                <div className="bet-locked">
                  ✓ You bet <b>{myBet.points}</b> on <b>{options[myBet.choice]}</b> — locked in!
                </div>
              )}

              {bountyPreview ? (
                <div className="bounty-line">💰 Bounty for the winner: <b>{bountyPreview}</b> points</div>
              ) : null}

              {/* Status line for everyone who isn't facing the big countdown */}
              {betsLockAt && !betsLocked && (!amPlayer || !!myBet) && (
                <div className="lock-status">🔒 Betting closes in {lockSecondsLeft}s</div>
              )}
              {betsLocked && (!amPlayer || !!myBet) && (
                <div className="lock-status locked">🔒 Bets are locked</div>
              )}

              {/* Host: lock betting first, then judge the contest */}
              {isHost && !betsLockAt && (
                <div className="host-lock">
                  <button className="mega-btn lock-btn" onClick={lockBets}>
                    🔒 LOCK BETS
                  </button>
                </div>
              )}

              {isHost && betsLocked && (
                <div className="host-resolve">
                  <div className="resolve-title">Who won?</div>
                  <WagerResolutionForm
                    onSubmit={resolveWager}
                    options={options}
                    onSelectionChange={setHasResolutionSelected}
                  />
                </div>
              )}

              {isHost && (
                <button
                  onClick={handleCancelClick}
                  className={`cancel-btn ${cancelConfirmationActive ? 'danger' : ''}`}
                  disabled={hasResolutionSelected}
                >
                  {cancelConfirmationActive ? 'Confirm cancel?' : 'Cancel contest'}
                </button>
              )}
            </div>
          )
        })()}

        {/* ---- Resolved: results, until the host moves on ---- */}
        {!finished && result && (
          <div className="contest-area">
            <div className="round-strip">Result</div>
            <div className="category-title winner-title">
              {playerNames[result.winnerPlayerId] || 'Winner'} WINS!
            </div>
            {/* How the win came about, in the duel screen's words: which
                side won, what bets on it paid, and the winner's bounty */}
            {(() => {
              const won = odds[result.correctChoice] || 1
              const lost = odds[1 - result.correctChoice] || 1
              const role = won === lost ? 'Even odds' : (won > lost ? 'Underdog' : 'Favorite')
              return (
                <div className="winner-sub">
                  <span className="ws-role">{role}</span>
                  <span className="ws-stat"><b>{won}×</b> payout</span>
                  {result.bountyAmount > 0 && (
                    <span className="ws-stat bounty"><b>+{result.bountyAmount}</b> bounty</span>
                  )}
                </div>
              )
            })()}

            {/* What this contest did for you (players only, not the TV or
                an emcee host) */}
            {amPlayer && (() => {
              const mine = result.results.find(r => r.playerId === playerId)
              // The bounty already shows under the winner title; it gets its
              // own line only for a contest winner who didn't bet
              const bounty = playerId === result.winnerPlayerId && result.bountyAmount > 0
                ? result.bountyAmount
                : 0
              const line = (cls, words, amount) => (
                <div className={`my-result ${cls}`}>
                  {words}
                  {amount ? <> <span className="my-result-amount">{amount}</span></> : null}
                </div>
              )
              if (mine && mine.correct) return line('won', 'You won your bet!', mine.pointsChange)
              if (mine) return line('lost', 'You lost your bet.', mine.pointsChange)
              if (bounty) return line('won', 'You won the bounty! 💰', `+${bounty}`)
              return line('out', 'You sat this one out.')
            })()}

            <StandingsTable standings={standings} stats={gameState?.stats} roundResults={result} />

            {/* Next scheduled matchup goes via the pre-contest odds screen;
                an exhausted schedule ends the night with the Winner screen */}
            {isHost && (
              openMatchups.length > 0 || schedule.length === 0 ? (
                <button onClick={dismissResult} className="btn btn-primary next-contest-btn">
                  {openMatchups.length > 0 ? 'NEXT MATCHUP ★' : 'NEXT CONTEST ★'}
                </button>
              ) : (
                <button onClick={finishGame} className="btn btn-primary next-contest-btn">
                  FINISH GAME ★
                </button>
              )
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {/* ---- Standings, open below the fold: game state, not reference
             material (results and the finale show it in the stage) ---- */}
        {!finished && !result && (
          <div className="standings-section">
            <StandingsTable standings={standings} stats={gameState?.stats} />
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
            </div>
          )}
        </details>

        {isHost && (
          <div className="host-links">
            {schedule.length > 0 && (
              <a
                className="show-matchups-link"
                href={`/matchmaker?game=${gameId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                🎲 Tonight's matchups
              </a>
            )}
            <a
              className="show-matchups-link"
              href={`/tv/${gameId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              📺 TV screen
            </a>
          </div>
        )}

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

// The one leaderboard: contest W-L, bet W-L, total wagered, score —
// and, when roundResults is given (the Results screen), a Round ± column
// leading the numbers. Same table, same visual language, everywhere.
// A column header with a one-letter form for phone widths
function ColLabel({ full, short }) {
  return (
    <>
      <span className="col-full">{full}</span>
      <span className="col-short" title={full}>{short}</span>
    </>
  )
}

// Leaderboard, in rankPlayers order with its positions (shared only when
// every tiebreak is level). With roundResults (the Result screen) it also
// shows this round's point change and how many places each player moved
// because of it: the earlier positions are reconstructed from the result
// (lib/standings), so no history is needed.
function StandingsTable({ standings, stats, roundResults }) {
  const before = roundResults ? positionsBefore(standings, stats, roundResults) : null

  return (
    <table className="night-summary">
      <thead>
        <tr>
          <th></th>
          <th><ColLabel full="Contests" short="C" /></th>
          <th><ColLabel full="Bets" short="B" /></th>
          <th><ColLabel full="Wagered" short="W" /></th>
          {roundResults && <th><ColLabel full="Round" short="R" /></th>}
          <th><ColLabel full="Score" short="S" /></th>
        </tr>
      </thead>
      <tbody>
        {standings.map((p) => {
          const s = statsFor(stats, p.id)
          const pos = p.position
          const moved = before ? before.get(p.id) - pos : 0 // places climbed
          let roundCell = null
          if (roundResults) {
            const { delta, active } = roundChange(roundResults, p.id)
            const cls = !active ? 'none' : delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'even'
            roundCell = (
              <td className={`sum-delta ${cls}`}>
                {active ? (delta > 0 ? `+${delta}` : `${delta}`) : '–'}
              </td>
            )
          }
          return (
            <tr key={p.id} className={p.isMe ? 'me' : ''}>
              <td className="sum-name">
                <span className="sum-place">
                  <span className="sum-rank">{pos === 1 ? '🏆' : `#${pos}`}</span>
                  {moved !== 0 && (
                    <span className={`sum-move ${moved > 0 ? 'up' : 'down'}`}>
                      {moved > 0 ? '▲' : '▼'}{Math.abs(moved)}
                    </span>
                  )}
                </span>
                {' '}{avatarFor(p.id)} {p.name}
              </td>
              <td>{s.contestWins}–{s.contestLosses}</td>
              <td>{s.betWins}–{s.betLosses}</td>
              <td>{s.totalBet}</td>
              {roundCell}
              <td className="sum-score">{p.points}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
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
function WagerResolutionForm({ onSubmit, options, onSelectionChange }) {
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
          {options[0]}
        </button>
        <button
          type="button"
          className={`resolve-pick ${correctChoice === '1' ? 'picked' : ''}`}
          onClick={() => handleOptionClick('1')}
        >
          {options[1]}
        </button>
      </div>
      <button type="submit" className="place-bet resolve" disabled={correctChoice === ''}>
        RESOLVE CONTEST
      </button>
    </form>
  )
}

export default GameBoard
