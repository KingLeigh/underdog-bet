import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './Home.css'

function Home() {
  const [gameId, setGameId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createPlayerName, setCreatePlayerName] = useState('')
  const [categories, setCategories] = useState('')
  const [startingPoints, setStartingPoints] = useState(100)
  const [maxBetSize, setMaxBetSize] = useState('')
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { createGame, joinGame, currentGame, gameState, error, clearError } = useGame()

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

  // Parse query parameter to pre-populate game ID
  useEffect(() => {
    const gameParam = searchParams.get('game')
    if (gameParam) {
      setGameId(gameParam.toUpperCase())
    }
  }, [searchParams])

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
