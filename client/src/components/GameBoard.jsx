import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './GameBoard.css'

function GameBoard() {
  const { gameId, playerId: urlPlayerId } = useParams()
  const navigate = useNavigate()
  const [selectedOption, setSelectedOption] = useState(null)
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
    error,
    rejoinGame
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

  // Reset selectedOption when wager state changes
  useEffect(() => {
    if (!wagerActive) {
      setSelectedOption(null)
    }
  }, [wagerActive])

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
            <span>Your ID: {playerId ? playerId.slice(0, 8) + '...' : 'Not set'}</span>
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
                  <div 
                    className={`wager-option ${playerChoices[playerId]?.choice === 0 ? 'selected' : ''} ${!playerChoices[playerId] ? 'clickable' : ''}`}
                    onClick={() => {
                      if (!playerChoices[playerId]) {
                        // Show points input for this option
                        setSelectedOption(0);
                      }
                    }}
                  >
                    <strong>Option A:</strong> {wagerOptions[0]}
                  </div>
                  <div 
                    className={`wager-option ${playerChoices[playerId]?.choice === 1 ? 'selected' : ''} ${!playerChoices[playerId] ? 'clickable' : ''}`}
                    onClick={() => {
                      if (!playerChoices[playerId]) {
                        // Show points input for this option
                        setSelectedOption(1);
                      }
                    }}
                  >
                    <strong>Option B:</strong> {wagerOptions[1]}
                  </div>
                </div>
                
                {!playerChoices[playerId] && selectedOption !== null && (
                  <div className="wager-input-section">
                    <h4>Wager Points for Option {selectedOption === 0 ? 'A' : 'B'}</h4>
                    <WagerInputForm 
                      onSubmit={(points) => {
                        makeChoice(selectedOption, points);
                        setSelectedOption(null);
                      }}
                      currentPoints={playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0}
                      onCancel={() => setSelectedOption(null)}
                    />
                  </div>
                )}

                {playerChoices[playerId] && (
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
                        {result.playerName}: {result.correct ? '✅ Correct' : '❌ Incorrect'}
                      </div>
                      <div className="result-detail">
                        <div>Chose: Option {result.choice === 0 ? 'A' : 'B'} ({wagerOptions[result.choice]})</div>
                        <div>Wagered: <span className="wager-amount">{result.points}</span> points</div>
                        <div className={`points-change ${result.pointsChange.startsWith('-') ? 'negative' : 'positive'}`}>
                          {result.pointsChange} points
                        </div>
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
          <h3>Score Tracker</h3>
          <div className="score-table">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {players
                  .map(pid => ({
                    id: pid,
                    name: playerNames[pid] || 'Unknown Player',
                    points: playerPoints[pid] !== undefined ? playerPoints[pid] : 0,
                    isCurrentPlayer: pid === playerId,
                    isHost: pid === gameState.host
                  }))
                  .sort((a, b) => b.points - a.points)
                  .map((player, index) => (
                    <tr 
                      key={player.id} 
                      className={`score-row ${player.isCurrentPlayer ? 'current-player' : ''}`}
                    >
                      <td className="rank-cell">
                        <span className="rank-number">#{index + 1}</span>
                      </td>
                      <td className="player-cell">
                        <div className="player-info">
                          <span className="player-name">
                            {player.name}
                            {player.isHost && ' 🎯'}
                            {player.isCurrentPlayer && ' (YOU)'}
                          </span>
                          {player.isHost && <span className="host-badge">Host</span>}
                        </div>
                      </td>
                      <td className="points-cell">
                        <span className={`points-value ${player.points < 0 ? 'negative' : ''}`}>{player.points}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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

// Wager Input Form Component (for points only)
function WagerInputForm({ onSubmit, currentPoints, onCancel }) {
  const [points, setPoints] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const maxWager = Math.max(50, currentPoints);
    if (points !== '' && parseInt(points) > 0 && parseInt(points) <= maxWager) {
      onSubmit(parseInt(points))
      setPoints('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="wager-input-form">
      <div className="form-group">
        <label htmlFor="wager-points">Wager Points:</label>
        <input
          type="number"
          id="wager-points"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          min="1"
          max={Math.max(50, currentPoints)}
          placeholder={`1-${Math.max(50, currentPoints)}`}
          required
          className="form-input"
        />
        <div className="points-info">
          <span className="points-available">Current: {currentPoints}</span> points
          <span className="wager-limit"> | Max wager: {Math.max(50, currentPoints)} points</span>
        </div>
      </div>
      
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={points === '' || parseInt(points) <= 0 || parseInt(points) > Math.max(50, currentPoints)}>
          Submit Wager
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
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
