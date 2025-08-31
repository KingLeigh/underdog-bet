import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import DragDropRanking from './DragDropRanking'
import './GameLobby.css'

function GameLobby() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { 
    gameState, 
    players, 
    playerPoints,
    playerNames,
    isHost, 
    playerId, 
    sendGameAction,
    error,
    categories,
    playerRankings,
    rankingsComplete,
    showRankingForm,
    submitRankings
  } = useGame()

  useEffect(() => {
    console.log('GameLobby: gameState updated', gameState)
    // If we have a game state, we're in the lobby
    if (gameState && gameState.status === 'waiting') {
      console.log('GameLobby: Staying in lobby, status is waiting')
      // Stay in lobby
    } else if (gameState && gameState.status === 'playing') {
      console.log(`GameLobby: Game started, navigating to game board: /game/${gameId}/player/${playerId}`)
      // Navigate to game board with player ID for seamless reconnections
      navigate(`/game/${gameId}/player/${playerId}`)
    }
  }, [gameState, gameId, navigate, playerId])

  const startGame = () => {
    if (isHost) {
      sendGameAction('startGame', {})
    }
  }

  const handleRankingsSubmit = (rankings) => {
    submitRankings(rankings)
  }

  // Debug logging for category ranking
  useEffect(() => {
    console.log('GameLobby category ranking debug:', {
      categories,
      playerRankings,
      rankingsComplete,
      showRankingForm,
      playerId,
      hasSubmittedRankings: playerRankings[playerId],
      shouldShowForm: categories && categories.length > 0 && !playerRankings[playerId]
    })
  }, [categories, playerRankings, rankingsComplete, showRankingForm, playerId])

  const copyGameId = () => {
    navigator.clipboard.writeText(gameId)
  }

  if (!gameState) {
    return (
      <div className="lobby">
        <div className="lobby-content">
          <h2>Loading...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="lobby">
      <div className="lobby-content">
        <div className="lobby-header">
          <h2>Game Lobby</h2>
          <div className="game-info">
            <div className="game-id">
              Game ID: <span>{gameId}</span>
              <button onClick={copyGameId} className="copy-btn">
                📋 Copy
              </button>
            </div>
            <div className="game-status">
              Status: <span className={`status-${gameState.status}`}>
                {gameState.status === 'waiting' ? 'Waiting for players' : 'Playing'}
              </span>
            </div>
          </div>
        </div>

        <div className="players-section">
          <h3>Players ({players.length})</h3>
          <div className="players-list">
            {players.map((playerId) => (
              <div key={playerId} className="player-item">
                <div className="player-avatar">👤</div>
                <div className="player-info">
                  <div className="player-name">
                    {playerNames[playerId] || 'Unknown Player'}
                  </div>
                  <div className="player-points">
                    Points: <span className={`points-value ${(playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0) < 0 ? 'negative' : ''}`}>{playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0}</span>
                  </div>
                </div>
                {playerId === gameState.host && (
                  <div className="host-badge">Host</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Category Ranking Section */}
        {categories && categories.length > 0 && (
          <div className="categories-section">
            <h3>Game Categories</h3>
            
            {!rankingsComplete && (
              <div className="ranking-status">
                <p>
                  {Object.keys(playerRankings).length} of {players.length} players have submitted rankings
                </p>
                {categories && categories.length > 0 && !playerRankings[playerId] && (
                  <DragDropRanking 
                    categories={categories}
                    onSubmit={handleRankingsSubmit}
                  />
                )}
                {playerRankings[playerId] && (
                  <div className="ranking-submitted">
                    <p>✅ Your rankings have been submitted!</p>
                    <div className="your-rankings">
                      {categories.map(category => (
                        <div key={category} className="ranking-item">
                          <span className="category-name">{category}:</span>
                          <span className="rank-value">Rank {playerRankings[playerId][category]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {rankingsComplete && (
              <div className="rankings-complete">
                <h4>All Rankings Complete!</h4>
                <div className="all-rankings">
                  {players.map(pid => (
                    <div key={pid} className="player-rankings">
                      <h5>{playerNames[pid] || 'Unknown Player'}</h5>
                      <div className="player-categories">
                        {categories
                          .map(category => ({
                            category,
                            rank: playerRankings[pid]?.[category] || 999
                          }))
                          .sort((a, b) => a.rank - b.rank)
                          .map(({ category, rank }) => (
                            <div key={category} className="ranking-item">
                              <span className="category-name">{category}:</span>
                              <span className="rank-value">Rank {rank === 999 ? 'N/A' : rank}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isHost && players.length >= 2 && (
          <div className="host-controls">
            <button 
              onClick={startGame} 
              className="btn btn-primary start-game-btn"
              disabled={players.length < 2 || (categories && categories.length > 0 && !rankingsComplete)}
            >
              Start Game
            </button>
            {categories && categories.length > 0 && !rankingsComplete && (
              <p className="start-game-note">
                Waiting for all players to complete category rankings...
              </p>
            )}
          </div>
        )}

        {!isHost && (
          <div className="waiting-message">
            <p>Waiting for the host to start the game...</p>
            <p>Share the Game ID with other players so they can join!</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default GameLobby
