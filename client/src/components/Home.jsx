import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './Home.css'

function Home() {
  const [gameId, setGameId] = useState('')
  const [playerName, setPlayerName] = useState('')
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { joinGame, currentGame, gameState, error, clearError } = useGame()


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

  // Check if we have a game parameter in the URL
  const hasGameParam = searchParams.get('game')

  return (
    <div className="home">
      <div className="home-content">
        <h1>Underdogs</h1>
        
        <div className="action-buttons">
          {!hasGameParam && (
            <>
              <button 
                className="btn btn-primary"
                onClick={() => navigate('/create-game')}
              >
                Host New Game
              </button>
              
              <button 
                className="btn btn-secondary"
                onClick={() => navigate('/matchmaker')}
              >
                Matchmaker
              </button>
              
              <button 
                className="btn btn-secondary"
                onClick={() => navigate('/challenge-selector')}
              >
                Challenge Selector
              </button>
              
              <div className="divider">or</div>
            </>
          )}
          
          <form onSubmit={handleJoinGame} className="join-form">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="player-name-input"
              required
            />
            {!hasGameParam && (
              <input
                type="text"
                placeholder="Enter Game ID"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="game-id-input"
                maxLength="6"
                required
              />
            )}
            <button type="submit" className={`btn ${hasGameParam ? 'btn-primary' : 'btn-secondary'}`}>
              Join Game
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}

export default Home
