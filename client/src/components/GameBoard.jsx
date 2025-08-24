import React, { useEffect, useState } from 'react'
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
    isHost,
    wagerOptions,
    wagerActive,
    playerChoices,
    wagerResolved,
    wagerResults,
    proposeWager,
    makeChoice,
    resolveWager,
    resetWagerState,
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
          {/* Wager System Interface */}
          <div className="wager-section">
            <h3>Wager System</h3>
            
            {!wagerActive && !wagerResolved && (
              <div className="wager-setup">
                {isHost ? (
                  <div className="host-wager-controls">
                    <h4>Propose a Wager</h4>
                    <WagerProposalForm onSubmit={proposeWager} />
                  </div>
                ) : (
                  <p>Waiting for host to propose a wager...</p>
                )}
              </div>
            )}

            {wagerActive && (
              <div className="active-wager">
                <h4>Current Wager</h4>
                <div className="wager-options">
                  <div className="wager-option">
                    <strong>Option A:</strong> {wagerOptions[0]}
                  </div>
                  <div className="wager-option">
                    <strong>Option B:</strong> {wagerOptions[1]}
                  </div>
                </div>
                
                {!playerChoices[playerId] ? (
                  <div className="player-choice">
                    <h4>Make Your Choice</h4>
                    <div className="choice-buttons">
                      <button 
                        onClick={() => makeChoice(0)}
                        className="btn btn-primary"
                      >
                        Choose Option A
                      </button>
                      <button 
                        onClick={() => makeChoice(1)}
                        className="btn btn-primary"
                      >
                        Choose Option B
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="choice-made">
                    <p>✅ You have submitted your choice</p>
                  </div>
                )}

                <div className="player-choices-summary">
                  <h4>Player Choices</h4>
                  {Object.entries(playerChoices).map(([pid, choiceData]) => (
                    <div key={pid} className="player-choice-item">
                      {choiceData.playerName || 'Unknown Player'}: ✅ Choice Submitted
                    </div>
                  ))}
                  {Object.keys(playerChoices).length === 0 && (
                    <p className="no-choices">No players have made choices yet...</p>
                  )}
                </div>

                {isHost && Object.keys(playerChoices).length > 0 && (
                  <div className="host-resolve-controls">
                    <h4>Resolve Wager</h4>
                    <WagerResolutionForm onSubmit={resolveWager} />
                  </div>
                )}
              </div>
            )}

            {wagerResolved && wagerResults && (
              <div className="wager-results">
                <h4>Wager Results</h4>
                <p><strong>Correct Answer:</strong> Option {wagerResults.correctChoice === 0 ? 'A' : 'B'}</p>
                <div className="results-list">
                  {wagerResults.results.map((result, index) => (
                    <div key={index} className={`result-item ${result.correct ? 'correct' : 'incorrect'}`}>
                      <div className="result-header">
                        {result.playerName}: {result.correct ? '✅ Correct (+100 points)' : '❌ Incorrect (0 points)'}
                      </div>
                      <div className="result-detail">
                        Chose: Option {result.choice === 0 ? 'A' : 'B'} ({wagerOptions[result.choice]})
                      </div>
                    </div>
                  ))}
                </div>
                {isHost && (
                  <button 
                    onClick={() => {
                      // Reset wager state for next round
                      resetWagerState();
                    }}
                    className="btn btn-secondary"
                  >
                    Propose New Wager
                  </button>
                )}
                {!isHost && (
                  <p className="waiting-message">Waiting for host to propose a new wager...</p>
                )}
              </div>
            )}
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

// Wager Proposal Form Component
function WagerProposalForm({ onSubmit }) {
  const [option1, setOption1] = useState('')
  const [option2, setOption2] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (option1.trim() && option2.trim()) {
      onSubmit(option1.trim(), option2.trim())
      setOption1('')
      setOption2('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="wager-proposal-form">
      <div className="form-group">
        <label htmlFor="option1">Option A:</label>
        <input
          type="text"
          id="option1"
          value={option1}
          onChange={(e) => setOption1(e.target.value)}
          placeholder="Enter first option"
          required
          className="form-input"
        />
      </div>
      <div className="form-group">
        <label htmlFor="option2">Option B:</label>
        <input
          type="text"
          id="option2"
          value={option2}
          onChange={(e) => setOption2(e.target.value)}
          placeholder="Enter second option"
          required
          className="form-input"
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Propose Wager
      </button>
    </form>
  )
}

// Wager Resolution Form Component
function WagerResolutionForm({ onSubmit }) {
  const [correctChoice, setCorrectChoice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (correctChoice !== '') {
      onSubmit(parseInt(correctChoice))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="wager-resolution-form">
      <div className="form-group">
        <label>Which option was correct?</label>
        <div className="choice-radio">
          <label>
            <input
              type="radio"
              name="correctChoice"
              value="0"
              checked={correctChoice === '0'}
              onChange={(e) => setCorrectChoice(e.target.value)}
            />
            Option A
          </label>
          <label>
            <input
              type="radio"
              name="correctChoice"
              value="1"
              checked={correctChoice === '1'}
              onChange={(e) => setCorrectChoice(e.target.value)}
            />
            Option B
          </label>
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={correctChoice === ''}>
        Resolve Wager
      </button>
    </form>
  )
}

export default GameBoard
