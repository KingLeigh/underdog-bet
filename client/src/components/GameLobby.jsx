import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
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
    error 
  } = useGame()

  useEffect(() => {
    console.log('GameLobby: gameState updated', gameState)
    // If we have a game state, we're in the lobby
    if (gameState && gameState.status === 'waiting') {
      console.log('GameLobby: Staying in lobby, status is waiting')
      // Stay in lobby
    } else if (gameState && gameState.status === 'playing') {
      console.log(`GameLobby: Game started, navigating to game board: /game/${gameId}`)
      // Navigate to game board
      navigate(`/game/${gameId}`)
    }
  }, [gameState, gameId, navigate])

  const startGame = () => {
    if (isHost) {
      sendGameAction('startGame', {})
    }
  }

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
          <h3>Players ({players.length}/{gameState.config?.maxPlayers || 4})</h3>
          <div className="players-list">
            {players.map((playerId) => (
              <div key={playerId} className="player-item">
                <div className="player-avatar">👤</div>
                <div className="player-info">
                  <div className="player-name">
                    {playerNames[playerId] || 'Unknown Player'}
                    {playerId === gameState.host && ' 🎯'}
                  </div>
                  <div className="player-id">{playerId.slice(0, 8)}...</div>
                  <div className="player-points">
                    Points: <span className="points-value">{playerPoints[playerId] || 100}</span>
                  </div>
                </div>
                {playerId === gameState.host && (
                  <div className="host-badge">Host</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost && players.length >= 2 && (
          <div className="host-controls">
            <button 
              onClick={startGame} 
              className="btn btn-primary start-game-btn"
              disabled={players.length < 2}
            >
              Start Game
            </button>
            <p className="start-hint">
              Need at least 2 players to start
            </p>
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
