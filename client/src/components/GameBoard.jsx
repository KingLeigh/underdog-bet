import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './GameBoard.css'

function GameBoard() {
  const { gameId, playerId: urlPlayerId } = useParams()
  const navigate = useNavigate()
  const [selectedOption, setSelectedOption] = useState(null)
  const [userChoice, setUserChoice] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
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
    rejoinGame,
    socket,
    categories,
    playerRankings,
    rankingsComplete
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

  // Reset selectedOption and userChoice when wager state changes
  useEffect(() => {
    if (!wagerActive) {
      setSelectedOption(null)
      setUserChoice(null)
    }
  }, [wagerActive])

  // Monitor connection status
  useEffect(() => {
    if (!socket) return

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    // Set initial connection status
    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [socket])

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
          <h2>Underdogs</h2>
        </div>

        <div className="game-area">
          {/* Wager System Interface */}
          <div className="wager-section">
            <h3>Active Contest</h3>
            
            {!wagerActive && !wagerResolved && (
              <div className="wager-setup">
                {isHost ? (
                  <div className="host-wager-controls">
                    <h4>Propose a Player Contest</h4>
                    <WagerProposalForm onSubmit={proposeWager} />
                  </div>
                ) : (
                  <p>Waiting for host to propose a player contest...</p>
                )}
              </div>
            )}

            {wagerActive && (
              <div className="active-wager">
                <h4>Choose Your Winner</h4>
                <div className="wager-options">
                  {(() => {
                    const currentPlayerName = playerNames[playerId];
                    const option0Name = wagerOptions.options?.[0] || wagerOptions[0];
                    const option1Name = wagerOptions.options?.[1] || wagerOptions[1];
                    const isPlayerInContest = currentPlayerName === option0Name || currentPlayerName === option1Name;
                    const canBetOnOption0 = !isPlayerInContest || currentPlayerName === option0Name;
                    const canBetOnOption1 = !isPlayerInContest || currentPlayerName === option1Name;
                    
                    return (
                      <>
                        <div 
                          className={`wager-option ${playerChoices[playerId]?.choice === 0 ? 'selected' : ''} ${!playerChoices[playerId] && canBetOnOption0 ? 'clickable' : ''} ${!canBetOnOption0 ? 'disabled' : ''}`}
                          onClick={() => {
                            if (!playerChoices[playerId] && canBetOnOption0) {
                              setSelectedOption(0);
                            } else if (!canBetOnOption0) {
                              setSelectedOption(null); // Clear selection if they can't bet on this option
                            }
                          }}
                        >
                          <strong>{option0Name}</strong>
                          <span className="odds-display">{wagerOptions.odds?.[0] || 1}:1</span>
                        </div>
                        <div 
                          className={`wager-option ${playerChoices[playerId]?.choice === 1 ? 'selected' : ''} ${!playerChoices[playerId] && canBetOnOption1 ? 'clickable' : ''} ${!canBetOnOption1 ? 'disabled' : ''}`}
                          onClick={() => {
                            if (!playerChoices[playerId] && canBetOnOption1) {
                              setSelectedOption(1);
                            } else if (!canBetOnOption1) {
                              setSelectedOption(null); // Clear selection if they can't bet on this option
                            }
                          }}
                        >
                          <strong>{option1Name}</strong>
                          <span className="odds-display">{wagerOptions.odds?.[1] || 1}:1</span>
                        </div>

                      </>
                    );
                  })()}
                </div>
                
                {!playerChoices[playerId] && selectedOption !== null && (() => {
                  const currentPlayerName = playerNames[playerId];
                  const selectedOptionName = wagerOptions.options?.[selectedOption] || wagerOptions[selectedOption];
                  const isPlayerInContest = currentPlayerName === wagerOptions.options?.[0] || currentPlayerName === wagerOptions.options?.[1];
                  const canBetOnSelectedOption = !isPlayerInContest || currentPlayerName === selectedOptionName;
                  
                  if (!canBetOnSelectedOption) {
                    return null; // Don't show wager input if they can't bet on this option
                  }
                  
                  return (
                    <div className="wager-input-section">
                      <h4>Wager Points for {selectedOptionName}</h4>
                      <WagerInputForm 
                        onSubmit={(points) => {
                          makeChoice(selectedOption, points);
                          setUserChoice(selectedOption); // Store the user's choice
                          setSelectedOption(null);
                        }}
                        currentPoints={playerPoints[playerId] !== undefined ? playerPoints[playerId] : 0}
                        onCancel={() => setSelectedOption(null)}
                      />
                    </div>
                  );
                })()}

                {playerChoices[playerId] && (() => {
                  const choiceData = playerChoices[playerId];
                  const betAmount = choiceData.points;
                  
                  // Use the locally stored userChoice to show which option the user selected
                  const selectedOptionName = wagerOptions.options?.[userChoice] || 'Unknown Player';
                  
                  return (
                    <div className="choice-made">
                      <p>✅ You bet <strong>{betAmount}</strong> points that <strong>{selectedOptionName}</strong> will win</p>
                    </div>
                  );
                })()}

                <div className="player-choices-summary">
                  <h4>Player Choices ({Object.keys(playerChoices).length}/{players.length})</h4>
                  {(() => {
                    const hasContestParticipants = Object.entries(playerChoices).some(([pid, choiceData]) => {
                      const playerName = choiceData.playerName || 'Unknown Player';
                      return playerName === wagerOptions.options?.[0] || playerName === wagerOptions.options?.[1];
                    });
                    
                    return (
                      <>

                        {Object.entries(playerChoices).map(([pid, choiceData]) => {
                          const playerName = choiceData.playerName || 'Unknown Player';
                          const isPlayerInContest = playerName === wagerOptions.options?.[0] || playerName === wagerOptions.options?.[1];
                          
                          return (
                            <div key={pid} className="player-choice-item">
                              <strong>{playerName}</strong> wagered <strong>{isPlayerInContest ? '??' : (choiceData.points || 0)}</strong> points
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                  {Object.keys(playerChoices).length === 0 && (
                    <p className="no-choices">No players have made choices yet...</p>
                  )}
                </div>

                {isHost && Object.keys(playerChoices).length > 0 && (
                  <div className="host-resolve-controls">
                    <h4>Resolve Contest</h4>
                    <WagerResolutionForm onSubmit={resolveWager} wagerOptions={wagerOptions} />
                  </div>
                )}
              </div>
            )}

            {wagerResolved && wagerResults && (
              <div className="wager-results">
                <h4>Contest Results</h4>
                <p><strong>Winner:</strong> {wagerOptions.options?.[wagerResults.correctChoice] || wagerOptions[wagerResults.correctChoice]} ({wagerOptions.odds?.[wagerResults.correctChoice] || 1}:1)</p>
                <div className="results-list">
                  {wagerResults.results.map((result, index) => (
                    <div key={index} className={`result-item ${result.correct ? 'correct' : 'incorrect'}`}>
                      <div className="result-header">
                        {result.playerName}: {result.correct ? '✅ Correct' : '❌ Incorrect'}
                      </div>
                      <div className="result-detail">
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
                      Propose New Contest
                    </button>
                  )}
                  {!isHost && (
                    <p className="waiting-message">Waiting for host to propose a new contest...</p>
                  )}
              </div>
            )}
          </div>
        </div>

        <div className="players-panel">
          <h3>Leaderboard</h3>
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
                            {player.isCurrentPlayer && ' (You)'}
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

        {/* Player Rankings Section */}
        {categories && categories.length > 0 && rankingsComplete && (
          <div className="player-rankings-section">
            <h3>Player Rankings</h3>
            <div className="rankings-grid">
              {players.map(pid => (
                <div key={pid} className="player-ranking-card">
                  <h4>{playerNames[pid] || 'Unknown Player'}</h4>
                  <div className="ranking-items">
                    {categories
                      .map(category => ({
                        category,
                        rank: playerRankings[pid]?.[category] || 999
                      }))
                      .sort((a, b) => a.rank - b.rank)
                      .map(({ category, rank }) => (
                        <div key={category} className="ranking-item">
                          <span className="category-name">{category}:</span>
                          <span className="rank-value">Rank {rank === 999 ? 'N/A' : rank}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="game-info-footer">
          <div className="game-info">
            <span>Game ID: {gameId}</span>
            <div className="connection-status">
              {isConnected ? (
                <span className="connected">🟢 Connected</span>
              ) : (
                <span className="disconnected">🔴 Disconnected</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wager Proposal Form Component
function WagerProposalForm({ onSubmit }) {
  const { players, playerNames, playerWagerCount, categories, playerRankings, rankingsComplete } = useGame()
  const [option1, setOption1] = useState('')
  const [option2, setOption2] = useState('')
  const [odds1, setOdds1] = useState(1)
  const [odds2, setOdds2] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (option1 && option2 && option1 !== option2) {
      onSubmit(option1, option2, odds1, odds2)
      setOption1('')
      setOption2('')
      setOdds1(1)
      setOdds2(1)
      setSelectedCategory('')
    }
  }

  // Get unique player names for dropdowns with wager counts and category rankings
  const playerNameList = players
    .map(pid => {
      const name = playerNames[pid];
      const wagerCount = playerWagerCount[pid] || 0;
      const categoryRank = selectedCategory && playerRankings[pid] ? playerRankings[pid][selectedCategory] : null;
      return { pid, name, wagerCount, categoryRank };
    })
    .filter(player => player.name && player.name.trim())
    .sort((a, b) => {
      // If category is selected, sort by rank (lowest first), then by name
      if (selectedCategory && a.categoryRank && b.categoryRank) {
        if (a.categoryRank !== b.categoryRank) {
          return a.categoryRank - b.categoryRank;
        }
      }
      // If no category selected, sort by games played (lowest first), then by name
      if (!selectedCategory) {
        if (a.wagerCount !== b.wagerCount) {
          return a.wagerCount - b.wagerCount;
        }
      }
      // Fallback to alphabetical sorting
      return a.name.localeCompare(b.name);
    })

  // Format player display name based on whether category is selected
  const formatPlayerDisplay = (player) => {
    if (selectedCategory && player.categoryRank) {
      return `${player.name} (Rank ${player.categoryRank}, Played ${player.wagerCount})`;
    } else {
      return `${player.name} (Played ${player.wagerCount})`;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="wager-proposal-form">
      {/* Category dropdown - only show if categories exist and rankings are complete */}
      {categories && categories.length > 0 && rankingsComplete && (
        <div className="form-group">
          <label htmlFor="category-select">Category Filter:</label>
          <select
            id="category-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="form-input category-select"
          >
            <option value="">All Categories</option>
            {categories.map((category, index) => (
              <option key={index} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="form-group">
        <label htmlFor="option1">First Player:</label>
        <select
          id="option1"
          value={option1}
          onChange={(e) => setOption1(e.target.value)}
          required
          className="form-input player-select"
        >
          <option value="">Select a player</option>
          {playerNameList.map((player, index) => (
            <option key={index} value={player.name} disabled={player.name === option2}>
              {formatPlayerDisplay(player)} {player.name === option2 ? '(Already selected)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="option2">Second Player:</label>
        <select
          id="option2"
          value={option2}
          onChange={(e) => setOption2(e.target.value)}
          required
          className="form-input player-select"
        >
          <option value="">Select a player</option>
          {playerNameList.map((player, index) => (
            <option key={index} value={player.name} disabled={player.name === option1}>
              {formatPlayerDisplay(player)} {player.name === option1 ? '(Already selected)' : ''}
            </option>
          ))}
        </select>
      </div>
      {option1 && option2 && option1 === option2 && (
        <div className="error-message">
          Please select two different players.
        </div>
      )}
      <div className="odds-section">
        <div className="form-group">
          <label htmlFor="odds1">Odds for {option1 || 'First Player'}:</label>
          <input
            type="number"
            id="odds1"
            value={odds1}
            onChange={(e) => setOdds1(Math.max(1, parseFloat(e.target.value) || 1))}
            min="1"
            step="0.1"
            className="form-input odds-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="odds2">Odds for {option2 || 'Second Player'}:</label>
          <input
            type="number"
            id="odds2"
            value={odds2}
            onChange={(e) => setOdds2(Math.max(1, parseFloat(e.target.value) || 1))}
            min="1"
            step="0.1"
            className="form-input odds-input"
          />
        </div>
      </div>
      <button 
        type="submit" 
        className="btn btn-primary"
        disabled={!option1 || !option2 || option1 === option2}
      >
        Propose Contest
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
function WagerResolutionForm({ onSubmit, wagerOptions }) {
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
        <label className="resolution-label">Who won the contest?</label>
        <div className="resolution-options">
          <div 
            className={`resolution-option ${correctChoice === '0' ? 'selected' : 'clickable'}`}
            onClick={() => setCorrectChoice('0')}
          >
            <strong>{wagerOptions.options?.[0] || wagerOptions[0]}</strong>
            <span className="odds-display">{wagerOptions.odds?.[0] || 1}:1</span>
          </div>
          <div 
            className={`resolution-option ${correctChoice === '1' ? 'selected' : 'clickable'}`}
            onClick={() => setCorrectChoice('1')}
          >
            <strong>{wagerOptions.options?.[1] || wagerOptions[1]}</strong>
            <span className="odds-display">{wagerOptions.odds?.[1] || 1}:1</span>
          </div>
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={correctChoice === ''}>
        Resolve Contest
      </button>
    </form>
  )
}

export default GameBoard
