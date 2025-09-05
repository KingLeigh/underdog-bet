import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './CreateGame.css'

function CreateGame() {
  const [createPlayerName, setCreatePlayerName] = useState('')
  const [categories, setCategories] = useState('')
  const [startingPoints, setStartingPoints] = useState(100)
  const [maxBetSize, setMaxBetSize] = useState('')
  
  const navigate = useNavigate()
  const { createGame, currentGame, gameState, error, clearError } = useGame()

  const handleCreateGame = (e) => {
    e.preventDefault()
    // Parse categories from comma-separated string
    const categoriesList = categories.trim() 
      ? categories.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0)
      : []
    
    // Parse max bet size - convert to number if provided, otherwise null
    const maxBetValue = maxBetSize.trim() ? parseInt(maxBetSize) : null
    
    createGame({ 
      playerName: createPlayerName,
      categories: categoriesList,
      startingPoints: startingPoints === '' ? 100 : startingPoints,
      maxBetSize: maxBetValue
    })
  }

  // Auto-navigate when game is created
  useEffect(() => {
    if (currentGame && gameState) {
      navigate(`/lobby/${currentGame}`)
    }
  }, [currentGame, gameState, navigate])

  // Listen for errors and clear them
  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [error, clearError])

  return (
    <div className="create-game">
      <div className="create-game-content">
        <div className="create-game-header">
          <h1>Create New Game</h1>
          <p>Set up your game with custom rules and settings</p>
        </div>

        <form onSubmit={handleCreateGame} className="create-game-form">
          <div className="form-section">
            <h2>Basic Settings</h2>
            
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
              <label htmlFor="startingPoints">Starting Points:</label>
              <input
                type="number"
                id="startingPoints"
                name="startingPoints"
                value={startingPoints}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setStartingPoints('');
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue)) {
                      setStartingPoints(numValue);
                    }
                  }
                }}
                min="1"
                max="10000"
                className="starting-points-input"
              />
              <small className="form-help">
                The number of points each player starts with. Default is 100.
              </small>
            </div>
            
            <div className="form-group">
              <label htmlFor="maxBetSize">Maximum Bet Size (Optional):</label>
              <input
                type="number"
                id="maxBetSize"
                name="maxBetSize"
                value={maxBetSize}
                onChange={(e) => setMaxBetSize(e.target.value)}
                min="1"
                max="10000"
                className="max-bet-input"
                placeholder="Leave empty for no limit"
              />
              <small className="form-help">
                Maximum bet size per wager. If empty, players can bet any amount they have available.
              </small>
            </div>
          </div>

          <div className="form-section">
            <h2>Game Categories (Optional)</h2>
            
            <div className="form-group">
              <label htmlFor="categories">Categories:</label>
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
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-large">
              Create Game
            </button>
            <button 
              type="button" 
              className="btn btn-secondary btn-large"
              onClick={() => navigate('/')}
            >
              Back to Home
            </button>
          </div>
        </form>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default CreateGame
