import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './GameBoard.css'

function GameBoard() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { 
    gameState, 
    players, 
    playerPoints,
    playerNames,
    playerId, 
    sendGameAction,
    addPoints,
    setPoints,
    error 
  } = useGame()

  useEffect(() => {
    console.log('GameBoard: gameState updated', gameState)
    // If game is not playing, redirect to lobby
    if (gameState && gameState.status !== 'playing') {
      console.log(`GameBoard: Game not playing (status: ${gameState.status}), redirecting to lobby`)
      navigate(`/lobby/${gameId}`)
    } else if (gameState && gameState.status === 'playing') {
      console.log('GameBoard: Game is playing, staying on game board')
    }
  }, [gameState, gameId, navigate])

  const handleGameAction = (action, payload) => {
    sendGameAction(action, payload)
  }

  if (!gameState || gameState.status !== 'playing') {
    return (
      <div className="game-board">
        <div className="game-board-content">
          <h2>Loading game...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="game-board">
      <div className="game-board-content">
        <div className="game-header">
          <h2>Game in Progress</h2>
          <div className="game-info">
            <span>Game ID: {gameId}</span>
            <span>Players: {players.length}</span>
          </div>
        </div>

        <div className="game-area">
          <div className="game-status">
            <h3>Game Status</h3>
            <p>This is where your game board will be displayed</p>
            <p>Game state: {JSON.stringify(gameState, null, 2)}</p>
          </div>

          <div className="player-actions">
            <h3>Your Actions</h3>
            <div className="action-buttons">
              <button 
                onClick={() => handleGameAction('testAction', { message: 'Hello from player!' })}
                className="btn btn-secondary"
              >
                Test Action
              </button>
              <button 
                onClick={() => handleGameAction('endTurn', {})}
                className="btn btn-primary"
              >
                End Turn
              </button>
              <button 
                onClick={() => addPoints(playerId, 10)}
                className="btn btn-secondary"
              >
                +10 Points
              </button>
              <button 
                onClick={() => addPoints(playerId, -5)}
                className="btn btn-secondary"
              >
                -5 Points
              </button>
              <button 
                onClick={() => setPoints(playerId, 100)}
                className="btn btn-secondary"
              >
                Reset to 100
              </button>
            </div>
          </div>
        </div>

        <div className="players-panel">
          <h3>Players</h3>
          <div className="players-list">
            {players.map((pid) => (
              <div 
                key={pid} 
                className={`player-item ${pid === playerId ? 'current-player' : ''}`}
              >
                <div className="player-avatar">👤</div>
                <div className="player-info">
                  <div className="player-name">
                    {pid === playerId ? 'You' : playerNames[pid] || 'Unknown Player'}
                    {pid === gameState.host && ' 🎯'}
                  </div>
                  <div className="player-id">{pid.slice(0, 8)}...</div>
                  <div className="player-points">
                    Points: <span className="points-value">{playerPoints[pid] || 100}</span>
                  </div>
                </div>
                {pid === gameState.host && (
                  <div className="host-badge">Host</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default GameBoard
