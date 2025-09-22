import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import RulesPanel from './RulesPanel'
import './GameLobby.css'
import './CategoryRanking.css'

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

  // CategoryRanking state
  const [rankedCategories, setRankedCategories] = useState([])
  const [nextRank, setNextRank] = useState(1)

  // Initialize categories with random order
  useEffect(() => {
    if (categories && categories.length > 0) {
      // Create a shuffled copy of categories
      const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)
      
      setRankedCategories(shuffledCategories.map((category) => ({
        id: category,
        name: category,
        rank: null // No rank assigned initially
      })))
      setNextRank(1) // Reset next rank to 1
    }
  }, [categories])

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

  // CategoryRanking functions
  const handleCategoryClick = (categoryId) => {
    setRankedCategories(prevCategories => {
      return prevCategories.map(category => {
        if (category.id === categoryId) {
          if (category.rank === null) {
            // Assign new rank
            return { ...category, rank: nextRank }
          } else if (category.rank === nextRank - 1) {
            // Unset the highest rank (most recently assigned)
            return { ...category, rank: null }
          }
        }
        return category
      })
    })
    
    // Update nextRank based on whether we're setting or unsetting
    const clickedCategory = rankedCategories.find(cat => cat.id === categoryId)
    if (clickedCategory && clickedCategory.rank === null) {
      // Setting a new rank
      setNextRank(prevRank => prevRank + 1)
    } else if (clickedCategory && clickedCategory.rank === nextRank - 1) {
      // Unsetting the highest rank
      setNextRank(prevRank => prevRank - 1)
    }
  }

  // Check if all categories have been ranked
  const allCategoriesRanked = rankedCategories.every(category => category.rank !== null)

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Convert to the expected format: { category: rank }
    const rankings = {}
    rankedCategories.forEach(item => {
      rankings[item.name] = item.rank
    })
    
    handleRankingsSubmit(rankings)
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
    const fullUrl = `${window.location.origin}?game=${gameId}`
    navigator.clipboard.writeText(fullUrl)
  }

  if (!gameState) {
    return (
      <div className="lobby">
        <div className="lobby-content">
          <div className="loading-section">
            <h2>Connecting to Game...</h2>
            <div className="loading-spinner"></div>
            <p className="loading-message">
              Attempting to connect to the game server.
            </p>
            
            <div className="troubleshooting">
              <h3>Having trouble connecting?</h3>
              <ul>
                <li>Check your internet connection</li>
                <li>Verify the game ID is correct</li>
                <li>The game may have ended or been reset</li>
                <li>Try refreshing the page</li>
              </ul>
              
              <div className="loading-actions">
                <button 
                  onClick={() => window.location.href = '/'}
                  className="btn btn-secondary"
                >
                  ← Back to Home
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="btn btn-primary"
                >
                  🔄 Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lobby">
      <div className="lobby-content">
        <div className="lobby-header">
          <h1>Game Lobby</h1>
          <div className="game-info">
            <div className="game-id">
              Game ID: <span>{gameId}</span>
              <button onClick={copyGameId} className="copy-btn">
                📋 Copy
              </button>
            </div>
          </div>
        </div>

        <div className="players-section panel-spacing">
          <h2>Players ({players.length})</h2>
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
          <div className="categories-section category-ranking panel-spacing">
            {categories && categories.length > 0 && !playerRankings[playerId] && (
              <>
                <div className="ranking-header">
                  <h2>Rank Your Categories</h2>
                  <p>Click each category in order of preference. Rank 1 is your strongest, {categories.length} is your weakest.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="ranking-form">
                  <div className="categories-list">
                    {rankedCategories.map((item, index) => {
                      const isClickable = item.rank === null || item.rank === nextRank - 1
                      const isHighestRank = item.rank === nextRank - 1
                      
                      return (
                        <div
                          key={item.id}
                          className={`category-item ${isClickable ? 'clickable' : 'ranked'} ${isHighestRank ? 'highest-rank' : ''}`}
                          onClick={() => isClickable && handleCategoryClick(item.id)}
                        >
                          <div className="rank-number">
                            {item.rank ? `#${item.rank}` : ''}
                          </div>
                          <div className="category-content">
                            <span className="category-name">{item.name}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  <div className="ranking-actions">
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={!allCategoriesRanked}
                    >
                      Submit Rankings
                    </button>
                  </div>
                </form>
              </>
            )}
            {playerRankings[playerId] && (
              <div className="ranking-submitted">
                <p>✅ Your rankings have been submitted!</p>
                <div className="your-rankings">
                  {categories
                    .map(category => ({
                      category,
                      rank: playerRankings[playerId][category]
                    }))
                    .sort((a, b) => a.rank - b.rank)
                    .map(({ category, rank }) => (
                      <div key={category} className="ranking-item">
                        <span className="ranking-text">
                          <span className="rank-value">#{rank}</span>
                          <span className="category-name"> {category}</span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rankings Status */}
        {categories && categories.length > 0 && (
          <div className="ranking-status panel-spacing">
            <p>
              {Object.keys(playerRankings).length} of {players.length} players have submitted rankings
            </p>
          </div>
        )}

        {/* Rules Panel */}
        <div className="panel-spacing">
          <RulesPanel 
            gameState={gameState}
            playerWagerCount={null}
            categories={categories}
          />
        </div>

        {isHost && players.length >= 2 && (
          <div className="host-controls">
            <button 
              onClick={startGame} 
              className="btn btn-primary start-game-btn"
              disabled={players.length < 2 || (categories && categories.length > 0 && players.some(pid => !playerRankings[pid]))}
            >
              Start Game
            </button>
            {categories && categories.length > 0 && players.some(pid => !playerRankings[pid]) && (
              <p className="start-game-note">
                Waiting for all players to complete category rankings...
              </p>
            )}
            {categories && categories.length > 0 && !players.some(pid => !playerRankings[pid]) && (
              <p className="start-game-note">
                All players have submitted rankings! Ready to start.
              </p>
            )}
            {(!categories || categories.length === 0) && (
              <p className="start-game-note">
                Share the Game ID with other players so they can join!
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
