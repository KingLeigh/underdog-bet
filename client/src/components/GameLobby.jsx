import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import RulesPanel from './RulesPanel'
import { avatarFor } from '../lib/avatars'
import './GameLobby.css'

function GameLobby() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const {
    gameState,
    players,
    playerNames,
    isHost,
    playerId,
    sendGameAction,
    error,
    categories,
    playerRankings,
    rankingsComplete,
    submitRankings,
    removePlayer
  } = useGame()

  // Category ranking state
  const [rankedCategories, setRankedCategories] = useState([])
  const [nextRank, setNextRank] = useState(1)
  const [copied, setCopied] = useState(false)

  // Initialize categories with random order
  useEffect(() => {
    if (categories && categories.length > 0) {
      const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)

      setRankedCategories(shuffledCategories.map((category) => ({
        id: category,
        name: category,
        rank: null
      })))
      setNextRank(1)
    }
  }, [categories])

  useEffect(() => {
    if (gameState && gameState.status === 'playing') {
      // Navigate to game board with player ID for seamless reconnections
      navigate(`/game/${gameId}/player/${playerId}`)
    }
  }, [gameState, gameId, navigate, playerId])

  const startGame = () => {
    if (isHost) {
      sendGameAction('startGame', {})
    }
  }

  // Category ranking: click to assign the next rank; click the latest to undo
  const handleCategoryClick = (categoryId) => {
    setRankedCategories(prevCategories => {
      return prevCategories.map(category => {
        if (category.id === categoryId) {
          if (category.rank === null) {
            return { ...category, rank: nextRank }
          } else if (category.rank === nextRank - 1) {
            return { ...category, rank: null }
          }
        }
        return category
      })
    })

    const clickedCategory = rankedCategories.find(cat => cat.id === categoryId)
    if (clickedCategory && clickedCategory.rank === null) {
      setNextRank(prevRank => prevRank + 1)
    } else if (clickedCategory && clickedCategory.rank === nextRank - 1) {
      setNextRank(prevRank => prevRank - 1)
    }
  }

  const allCategoriesRanked = rankedCategories.every(category => category.rank !== null)

  const handleSubmit = (e) => {
    e.preventDefault()
    const rankings = {}
    rankedCategories.forEach(item => {
      rankings[item.name] = item.rank
    })
    submitRankings(rankings)
  }

  const copyGameId = () => {
    const fullUrl = `${window.location.origin}?game=${gameId}`
    navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!gameState) {
    return (
      <div className="lobby">
        <div className="lobby-loading">
          <div className="round-strip">Connecting…</div>
          <h2>Joining the game</h2>
          <p>
            If this takes more than a moment, the game may have ended — head
            back home and join again with the same name.
          </p>
          <button onClick={() => window.location.href = '/'} className="mega-btn violet">
            ← Back to Home
          </button>
        </div>
      </div>
    )
  }

  const hasCategories = categories && categories.length > 0
  const rankedCount = hasCategories
    ? players.filter(pid => playerRankings[pid]).length
    : players.length
  const unrankedCount = players.length - rankedCount

  return (
    <div className="lobby">
      <div className="lobby-content">
        <div className="round-strip">Game Lobby</div>
        <button className="game-code" onClick={copyGameId} title="Copy the invite link">
          {gameId}
        </button>
        <button className="copy-link" onClick={copyGameId}>
          {copied ? '✓ Invite link copied!' : '🔗 Copy invite link'}
        </button>

        {/* Players */}
        <div className="player-chips">
          {players.map((pid) => (
            <div
              key={pid}
              className={`player-chip ${hasCategories ? (playerRankings[pid] ? 'ready' : 'waiting') : ''}`}
            >
              <span className="chip-avatar">{avatarFor(pid)}</span>
              <span className="chip-name">
                {pid === gameState.host && '👑 '}
                {playerNames[pid] || 'Unknown Player'}
              </span>
              {hasCategories && (
                <span className="chip-state">
                  {playerRankings[pid] ? '✓ ready' : 'not ranked'}
                </span>
              )}
              {isHost && pid !== gameState.host && (
                <button
                  className="kick-btn"
                  title={`Remove ${playerNames[pid] || 'player'} from the game`}
                  onClick={() => removePlayer(pid)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Category ranking */}
        {hasCategories && !playerRankings[playerId] && (
          <div className="ranking-stage">
            <div className="ranking-title">Rank Your Categories</div>
            <p className="ranking-hint">
              Tap in order of confidence — #1 is your strongest.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="rank-cards">
                {rankedCategories.map((item) => {
                  const isClickable = item.rank === null || item.rank === nextRank - 1
                  const isLatest = item.rank === nextRank - 1

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`rank-card ${item.rank ? 'ranked' : ''} ${isLatest ? 'latest' : ''}`}
                      disabled={!isClickable}
                      onClick={() => isClickable && handleCategoryClick(item.id)}
                    >
                      <span className="rank-num">{item.rank ? `#${item.rank}` : '·'}</span>
                      <span className="rank-name">{item.name}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="submit"
                className="mega-btn ranking-submit"
                disabled={!allCategoriesRanked}
              >
                LOCK IN MY RANKINGS ★
              </button>
            </form>
          </div>
        )}

        {hasCategories && playerRankings[playerId] && (
          <div className="ranked-done">
            ✓ Rankings locked:&nbsp;
            {categories
              .map(category => ({ category, rank: playerRankings[playerId][category] }))
              .sort((a, b) => a.rank - b.rank)
              .map(({ category, rank }, i) => (
                <span key={category}>
                  {i > 0 && ' · '}
                  <b>#{rank}</b> {category}
                </span>
              ))}
          </div>
        )}

        {hasCategories && (
          <div className="ranking-progress">
            {rankedCount} of {players.length} players ready
          </div>
        )}

        {/* Start / waiting */}
        {isHost && players.length >= 2 && (
          <div className="start-area">
            <button
              onClick={startGame}
              className="mega-btn start-btn"
              disabled={rankedCount < 2}
            >
              START THE GAME ★
            </button>
            {hasCategories && rankedCount < 2 && (
              <p className="start-note">Waiting for at least 2 players to rank…</p>
            )}
            {hasCategories && rankedCount >= 2 && unrankedCount > 0 && (
              <p className="start-note warn">
                Starting now drops {unrankedCount} unranked player{unrankedCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}

        {isHost && players.length < 2 && (
          <p className="waiting-line">Share the invite link — you need at least 2 players 🎉</p>
        )}

        {!isHost && (
          <p className="waiting-line">Waiting for the host to start the game…</p>
        )}

        {error && <div className="error-message">{error}</div>}

        <details className="game-details">
          <summary>Game rules</summary>
          <RulesPanel
            gameState={gameState}
            playerWagerCount={null}
            categories={categories}
          />
        </details>
      </div>
    </div>
  )
}

export default GameLobby
