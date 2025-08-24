import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './Home.css'

function Home() {
  const [gameId, setGameId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [gameConfig, setGameConfig] = useState({
    maxPlayers: 4,
    gameType: 'standard',
    playerName: ''
  })
  
  const navigate = useNavigate()
  const { createGame, joinGame, currentGame, gameState, error, clearError } = useGame()

  const handleCreateGame = (e) => {
    e.preventDefault()
    createGame(gameConfig)
    setShowCreateForm(false)
  }

  const handleJoinGame = (e) => {
    e.preventDefault()
    if (gameId.trim() && playerName.trim()) {
      joinGame(gameId.trim().toUpperCase(), playerName.trim())
    }
  }

  const handleGameConfigChange = (e) => {
    const { name, value } = e.target
    setGameConfig(prev => ({
      ...prev,
      [name]: name === 'maxPlayers' ? parseInt(value) : value
    }))
  }

  // Auto-navigate when game is created/joined
  useEffect(() => {
    if (currentGame && gameState) {
      console.log(`Navigating to lobby for game: ${currentGame}`)
      navigate(`/lobby/${currentGame}`)
    }
  }, [currentGame, gameState, navigate])

  // Listen for game creation/joining success and navigate
  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [error, clearError])

  return (
    <div className="home">
      <div className="home-content">
        <h2>Welcome to Underdog Bet</h2>
        <p>Create a new game or join an existing one</p>
        
        <div className="action-buttons">
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateForm(true)}
          >
            Create New Game
          </button>
          
          <div className="divider">or</div>
          
          <form onSubmit={handleJoinGame} className="join-form">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="player-name-input"
              required
            />
            <input
              type="text"
              placeholder="Enter Game ID"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="game-id-input"
              maxLength="6"
              required
            />
            <button type="submit" className="btn btn-secondary">
              Join Game
            </button>
          </form>
        </div>

        {showCreateForm && (
          <div className="create-game-modal">
            <div className="modal-content">
              <h3>Create New Game</h3>
              <form onSubmit={handleCreateGame}>
                <div className="form-group">
                  <label htmlFor="playerName">Your Name:</label>
                  <input
                    type="text"
                    id="playerName"
                    name="playerName"
                    value={gameConfig.playerName}
                    onChange={handleGameConfigChange}
                    placeholder="Enter your name"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="maxPlayers">Maximum Players:</label>
                  <select
                    id="maxPlayers"
                    name="maxPlayers"
                    value={gameConfig.maxPlayers}
                    onChange={handleGameConfigChange}
                  >
                    <option value={2}>2 Players</option>
                    <option value={3}>3 Players</option>
                    <option value={4}>4 Players</option>
                    <option value={6}>6 Players</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="gameType">Game Type:</label>
                  <select
                    id="gameType"
                    name="gameType"
                    value={gameConfig.gameType}
                    onChange={handleGameConfigChange}
                  >
                    <option value="standard">Standard</option>
                    <option value="quick">Quick Play</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </div>
                
                <div className="modal-actions">
                  <button type="submit" className="btn btn-primary">
                    Create Game
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Home
