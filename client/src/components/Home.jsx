import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './Home.css'

function Home() {
  const [gameId, setGameId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createPlayerName, setCreatePlayerName] = useState('')
  const [categories, setCategories] = useState('')
  
  const navigate = useNavigate()
  const { createGame, joinGame, currentGame, gameState, error, clearError } = useGame()

  const handleCreateGame = (e) => {
    e.preventDefault()
    // Parse categories from comma-separated string
    const categoriesList = categories.trim() 
      ? categories.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0)
      : []
    
    createGame({ 
      playerName: createPlayerName,
      categories: categoriesList
    })
    setShowCreateForm(false)
  }

  const handleJoinGame = (e) => {
    e.preventDefault()
    if (gameId.trim() && playerName.trim()) {
      joinGame(gameId.trim().toUpperCase(), playerName.trim())
    }
  }

  // Auto-navigate when game is created/joined
  useEffect(() => {
    console.log('Home: Navigation effect triggered', { currentGame, gameState: gameState?.id, status: gameState?.status })
    if (currentGame && gameState) {
      console.log(`Navigating to lobby for game: ${currentGame}`)
      navigate(`/lobby/${currentGame}`)
    } else {
      console.log('Home: Navigation conditions not met', { 
        hasCurrentGame: !!currentGame, 
        hasGameState: !!gameState,
        currentGame,
        gameStateId: gameState?.id
      })
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
        <h2>Underdogs</h2>
        
        <div className="action-buttons">
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateForm(true)}
          >
            Host New Game
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
              Join Existing Game
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
                    value={createPlayerName}
                    onChange={(e) => setCreatePlayerName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="categories">Categories (Optional):</label>
                  <input
                    type="text"
                    id="categories"
                    name="categories"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    placeholder="e.g., Speed, Strength, Intelligence, Luck"
                    className="categories-input"
                  />
                  <small className="form-help">
                    Comma-separated list of categories for player ranking. Players will rank themselves 1-4 in each category before the game starts.
                  </small>
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
