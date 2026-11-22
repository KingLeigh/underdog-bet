import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import RulesPanel from './RulesPanel'
import { buildMatchmakerConfigUrl } from '../lib/matchmakerUrl'
import './GameBoard.css'

function GameBoard() {
  const { gameId, playerId: urlPlayerId } = useParams()
  const navigate = useNavigate()
  const [selectedOption, setSelectedOption] = useState(null)
  const [userChoice, setUserChoice] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [hasResolutionSelected, setHasResolutionSelected] = useState(false)
  const [cancelConfirmationActive, setCancelConfirmationActive] = useState(false)
  const { 
    gameState, 
    players, 
    playerPoints,
    playerNames,
    playerWagerCount,
    playerId, 
    isHost,
    wagerOptions,
    wagerContestants,
    wagerActive,
    playerChoices,
    wagerResolved,
    wagerResults,
    proposeWager,
    makeChoice,
    resolveWager,
    cancelWager,
    resetWagerState,
    error,
    rejoinGame,
    socket,
    categories,
    challengesPerCategory,
    playerRankings,
    rankingsComplete,
    wagerCategory
  } = useGame()

  useEffect(() => {
    // If game is not playing, redirect to lobby
    if (gameState && gameState.status !== 'playing') {
      navigate(`/lobby/${gameId}`)
    }
  }, [gameState, gameId, navigate])

  // Reset selectedOption and userChoice when wager state changes
  useEffect(() => {
    if (!wagerActive) {
      setSelectedOption(null)
      setUserChoice(null)
      setHasResolutionSelected(false)
      setCancelConfirmationActive(false)
    }
  }, [wagerActive])

  // Handle cancel button clicks
  const handleCancelClick = () => {
    if (cancelConfirmationActive) {
      // Second click - actually cancel the wager
      cancelWager()
      setCancelConfirmationActive(false)
    } else {
      // First click - show confirmation
      setCancelConfirmationActive(true)
    }
  }

  // Reset cancel confirmation when resolution selection changes
  useEffect(() => {
    if (hasResolutionSelected) {
      setCancelConfirmationActive(false)
    }
  }, [hasResolutionSelected])

  // Auto-reset cancel confirmation after 5 seconds
  useEffect(() => {
    if (cancelConfirmationActive) {
      const timeout = setTimeout(() => {
        setCancelConfirmationActive(false)
      }, 5000) // 5 seconds

      return () => clearTimeout(timeout)
    }
  }, [cancelConfirmationActive])

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

  // Generate matchmaker URL for the current game
  const generateMatchmakerUrl = () => {
    if (!categories || categories.length === 0 || !players || players.length === 0 || !playerRankings) {
      return null
    }

    try {
      // Convert playerRankings to the format expected by generateMatchmakerFullUrl
      const ranks = players.map(playerId => {
        return categories.map(category => {
          const rank = playerRankings[playerId]?.[category]
          return rank || 999 // Default rank if not set
        })
      })

      // Create player names array
      const playerNamesArray = players.map(playerId => playerNames[playerId] || 'Unknown Player')

      // Use the actual challenges per category from game state
      const numChallenges = challengesPerCategory && challengesPerCategory.length > 0 
        ? challengesPerCategory 
        : categories.map(() => 1) // Fallback to 1 challenge per category

      const baseUrl = `${window.location.origin}/matchmaker`
      return buildMatchmakerConfigUrl(baseUrl, categories, numChallenges, playerNamesArray, ranks)
    } catch (error) {
      console.error('Error generating matchmaker URL:', error)
      return null
    }
  }

  // Bounty preview shown to contestants while a wager is active.
  // (After resolution, the authoritative amount arrives in wagerResults.)
  const bountyPreview = (() => {
    if (!wagerActive || !gameState || !gameState.bounty || gameState.bounty === 'None') return null
    if (!wagerContestants.includes(playerId)) return null
    const allBets = Object.values(playerChoices).map(c => c.points).filter(p => p > 0)
    if (allBets.length === 0) return null
    switch (gameState.bounty) {
      case 'Fixed': return gameState.bountyAmount || 0
      case 'Min': return Math.min(...allBets)
      case 'Max': return Math.max(...allBets)
      case 'Average': return Math.floor(allBets.reduce((s, b) => s + b, 0) / allBets.length)
      default: return null
    }
  })()

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
          <h1>Underdogs</h1>
        </div>

        <div className="game-area panel-spacing">
          {/* Wager System Interface */}
          <div className="wager-section standard-panel">
            <h2>Current Contest{wagerCategory ? `: ${wagerCategory}` : ''}</h2>
            
            {!wagerActive && !wagerResolved && (
              <div className="wager-setup">
                {isHost ? (
                  <div className="host-wager-controls">
                    <WagerProposalForm onSubmit={(option1, option2, odds1, odds2, category) => proposeWager(option1, option2, odds1, odds2, category)} />
                  </div>
                ) : (
                  <p>Waiting for first contest...</p>
                )}
              </div>
            )}

            {wagerActive && (
              <div className="active-wager">
                <h4>Choose Your Winner</h4>
                <div className="wager-options">
                  {(() => {
                    const odds0 = wagerOptions.odds[0] || 1;
                    const odds1 = wagerOptions.odds[1] || 1;

                    // Sort options by odds (lower odds on the left)
                    const sortedOptions = [
                      { name: wagerOptions.options[0], odds: odds0, originalIndex: 0 },
                      { name: wagerOptions.options[1], odds: odds1, originalIndex: 1 }
                    ].sort((a, b) => a.odds - b.odds);

                    const leftOption = sortedOptions[0];
                    const rightOption = sortedOptions[1];

                    const isPlayerInContest = wagerContestants.includes(playerId);
                    const canBetOnLeft = !isPlayerInContest || wagerContestants[leftOption.originalIndex] === playerId;
                    const canBetOnRight = !isPlayerInContest || wagerContestants[rightOption.originalIndex] === playerId;

                    // Get contestant ranks for the selected category
                    const getContestantRank = (originalIndex) => {
                      if (!wagerCategory || !playerRankings) return null;
                      const pid = wagerContestants[originalIndex];
                      return (pid && playerRankings[pid]?.[wagerCategory]) || null;
                    };

                    const leftRank = getContestantRank(leftOption.originalIndex);
                    const rightRank = getContestantRank(rightOption.originalIndex);
                    
                    return (
                      <>
                        <div 
                          className={`wager-option ${playerChoices[playerId]?.choice === leftOption.originalIndex ? 'selected' : ''} ${!playerChoices[playerId] && canBetOnLeft ? 'clickable' : ''} ${!canBetOnLeft ? 'disabled' : ''}`}
                          onClick={() => {
                            if (!playerChoices[playerId] && canBetOnLeft) {
                              setSelectedOption(leftOption.originalIndex);
                            } else if (!canBetOnLeft) {
                              setSelectedOption(null); // Clear selection if they can't bet on this option
                            }
                          }}
                        >
                          <div className="player-info">
                            <strong>{leftOption.name}</strong>
                            {leftRank && (
                              <span className="rank-display">Rank {leftRank}</span>
                            )}
                          </div>
                          <span className="odds-display">{leftOption.odds}:1</span>
                        </div>
                        <div 
                          className={`wager-option ${playerChoices[playerId]?.choice === rightOption.originalIndex ? 'selected' : ''} ${!playerChoices[playerId] && canBetOnRight ? 'clickable' : ''} ${!canBetOnRight ? 'disabled' : ''}`}
                          onClick={() => {
                            if (!playerChoices[playerId] && canBetOnRight) {
                              setSelectedOption(rightOption.originalIndex);
                            } else if (!canBetOnRight) {
                              setSelectedOption(null); // Clear selection if they can't bet on this option
                            }
                          }}
                        >
                          <div className="player-info">
                            <strong>{rightOption.name}</strong>
                            {rightRank && (
                              <span className="rank-display">Rank {rightRank}</span>
                            )}
                          </div>
                          <span className="odds-display">{rightOption.odds}:1</span>
                        </div>

                      </>
                    );
                  })()}
                </div>
                
                {/* Bounty Display - Only show to competing players */}
                {!!bountyPreview && (
                  <div className="bounty-display">
                    <div className="bounty-info">
                      <span className="bounty-label">💰 Bounty:</span>
                      <span className="bounty-amount">{bountyPreview} points</span>
                    </div>
                    <small className="bounty-description">
                      Winner receives this additional prize
                    </small>
                  </div>
                )}
                
                {!playerChoices[playerId] && selectedOption !== null && (() => {
                  const selectedOptionName = wagerOptions.options[selectedOption];
                  const isPlayerInContest = wagerContestants.includes(playerId);
                  const canBetOnSelectedOption = !isPlayerInContest || wagerContestants[selectedOption] === playerId;

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
                        minBetSize={gameState?.minBetSize}
                        maxBetSize={gameState?.maxBetSize}
                        onCancel={() => setSelectedOption(null)}
                      />
                    </div>
                  );
                })()}

                {playerChoices[playerId] && (() => {
                  const choiceData = playerChoices[playerId];
                  const betAmount = choiceData.points;

                  // Prefer the locally stored choice; fall back to the server-provided
                  // own choice (sent on reconnect) so the bet survives a refresh
                  const myChoice = userChoice !== null ? userChoice : choiceData.choice;
                  const selectedOptionName = myChoice !== null && myChoice !== undefined
                    ? wagerOptions.options[myChoice]
                    : 'Unknown Player';

                  return (
                    <div className="choice-made">
                      <p>✅ You bet <strong>{betAmount}</strong> points that <strong>{selectedOptionName}</strong> will win</p>
                    </div>
                  );
                })()}

                <div className="player-choices-summary">
                  <h4>Player Choices ({Object.keys(playerChoices).length}/{players.length})</h4>
                  {Object.entries(playerChoices).map(([pid, choiceData]) => {
                    const playerName = choiceData.playerName || 'Unknown Player';
                    const isPlayerInContest = wagerContestants.includes(pid);

                    return (
                      <div key={pid} className="player-choice-item">
                        <strong>{playerName}</strong> wagered <strong>{isPlayerInContest ? '??' : (choiceData.points || 0)}</strong> points
                      </div>
                    );
                  })}
                  {Object.keys(playerChoices).length === 0 && (
                    <p className="no-choices">No players have made choices yet...</p>
                  )}
                </div>

                {isHost && Object.keys(playerChoices).length > 0 && (
                  <div className="host-resolve-controls">
                    <h4>Resolve Contest</h4>
                    <WagerResolutionForm 
                      onSubmit={resolveWager} 
                      wagerOptions={wagerOptions}
                      onSelectionChange={setHasResolutionSelected}
                    />
                    <div className="contest-actions">
                      <button 
                        onClick={handleCancelClick}
                        className={`btn btn-small ${cancelConfirmationActive ? 'btn-danger' : 'btn-secondary'}`}
                        disabled={hasResolutionSelected}
                      >
                        {cancelConfirmationActive ? 'Confirm Cancel?' : 'Cancel Contest'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {wagerResolved && wagerResults && (
              <div className="wager-results">
                {/* Winner Information - Always shown */}
                <div className="bounty-result">
                  <div className="bounty-winner">
                    <span className="bounty-text">
                      <span className="winner-label">Winner:</span> {playerNames[wagerResults.winnerPlayerId]} @ {wagerOptions.odds?.[wagerResults.correctChoice] || 1}:1{wagerResults.bountyAmount && wagerResults.bountyAmount > 0 && <span className="bounty-points"> +{wagerResults.bountyAmount}</span>}
                    </span>
                  </div>
                </div>
                
                <div className="results-list">
                  {wagerResults.results.map((result, index) => {
                    const isPositive = result.pointsChange.startsWith('+');
                    const pointClass = isPositive ? 'positive-points' : 'negative-points';
                    return (
                      <div key={index} className={`result-item ${result.correct ? 'correct' : 'incorrect'}`}>
                        <span className="result-text">
                          {result.playerName} <span className={pointClass}>{result.pointsChange}</span>
                        </span>
                      </div>
                    );
                  })}
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
              </div>
            )}
          </div>
        </div>

        <div className="players-panel panel-spacing standard-panel">
          <div className="score-table">
            <table>
              <thead>
                <tr>
                  <th colSpan="3">Leaderboard</th>
                </tr>
              </thead>
              <tbody>
                {players
                  .map(pid => ({
                    id: pid,
                    name: playerNames[pid] || 'Unknown Player',
                    points: playerPoints[pid] !== undefined ? playerPoints[pid] : 0,
                    isCurrentPlayer: pid === playerId
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
                        </div>
                      </td>
                      <td className="points-cell">
                        <span className={`points-value ${player.points < 0 ? 'negative' : ''} ${index === 0 ? 'highest-score' : ''}`}>{player.points}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Game Information Panel */}
        <div className="panel-spacing">
          <RulesPanel 
            gameState={gameState}
            playerWagerCount={playerWagerCount}
            categories={categories}
          />
        </div>

        {/* Player Rankings Section */}
        {categories && categories.length > 0 && rankingsComplete && (
          <div className="player-rankings-section panel-spacing standard-panel">
            <h2>Player Rankings</h2>
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
                          <span className="ranking-text">
                            <span className="rank-value">#{rank === 999 ? 'N/A' : rank}</span>
                            <span className="category-name"> {category}</span>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Matchmaker Button - only visible to host */}
            {isHost && (
              <div className="matchmaker-button-container">
                <a 
                  href={generateMatchmakerUrl()} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Matchmaker
                </a>
              </div>
            )}
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
    if (option1 && option2 && option1 !== option2 && odds1 && odds2) {
      onSubmit(option1, option2, odds1, odds2, selectedCategory)
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

  // Format odds label with rank information
  const formatOddsLabel = (pid, defaultText) => {
    if (!pid) return defaultText;

    const name = playerNames[pid];
    const rank = selectedCategory ? playerRankings[pid]?.[selectedCategory] : null;
    if (rank) {
      return `Odds for ${name} (Rank ${rank}):`;
    } else {
      return `Odds for ${name}:`;
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
            <option value="">No Category</option>
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
          {playerNameList.map((player) => (
            <option key={player.pid} value={player.pid} disabled={player.pid === option2}>
              {formatPlayerDisplay(player)} {player.pid === option2 ? '(Already selected)' : ''}
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
          {playerNameList.map((player) => (
            <option key={player.pid} value={player.pid} disabled={player.pid === option1}>
              {formatPlayerDisplay(player)} {player.pid === option1 ? '(Already selected)' : ''}
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
          <label htmlFor="odds1">{formatOddsLabel(option1, 'Odds for First Player:')}</label>
          <input
            type="number"
            id="odds1"
            value={odds1}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                setOdds1('');
              } else {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  setOdds1(Math.max(1, numValue));
                }
              }
            }}
            min="1"
            step="0.1"
            className="form-input odds-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="odds2">{formatOddsLabel(option2, 'Odds for Second Player:')}</label>
          <input
            type="number"
            id="odds2"
            value={odds2}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                setOdds2('');
              } else {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  setOdds2(Math.max(1, numValue));
                }
              }
            }}
            min="1"
            step="0.1"
            className="form-input odds-input"
          />
        </div>
      </div>
      <button 
        type="submit" 
        className="btn btn-primary"
        disabled={!option1 || !option2 || option1 === option2 || !odds1 || !odds2}
      >
        Propose Contest
      </button>
    </form>
  )
}

// Wager Input Form Component (for points only)
function WagerInputForm({ onSubmit, currentPoints, minBetSize, maxBetSize, onCancel }) {
  const [points, setPoints] = useState('')

  const minWager = minBetSize || 1;

  // Calculate the effective maximum wager. The configured minimum is part of
  // the floor so every player can always bet at least the minimum, even with
  // zero or negative points.
  const calculateMaxWager = () => {
    let maxWager = Math.max(50, currentPoints, minWager);

    // Apply game-level maximum bet size limit if configured
    if (maxBetSize !== null && maxBetSize !== undefined) {
      maxWager = Math.min(maxWager, maxBetSize);
    }

    return maxWager;
  }

  const maxWager = calculateMaxWager();

  const handleSubmit = (e) => {
    e.preventDefault()
    if (points !== '' && parseInt(points) >= minWager && parseInt(points) <= maxWager) {
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
          min={minWager}
          max={maxWager}
          placeholder={`${minWager}-${maxWager}`}
          required
          className="form-input"
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={points === '' || parseInt(points) < minWager || parseInt(points) > maxWager}>
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
function WagerResolutionForm({ onSubmit, wagerOptions, onSelectionChange }) {
  const [correctChoice, setCorrectChoice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (correctChoice !== '') {
      onSubmit(parseInt(correctChoice))
    }
  }

  const handleOptionClick = (option) => {
    let newChoice
    if (correctChoice === option) {
      // If clicking the currently selected option, unselect it
      newChoice = ''
    } else {
      // Otherwise, select the clicked option
      newChoice = option
    }
    setCorrectChoice(newChoice)
    // Notify parent component of selection change
    if (onSelectionChange) {
      onSelectionChange(newChoice !== '')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="wager-resolution-form">
      <div className="form-group">
        <label className="resolution-label">Who won the contest?</label>
        <div className="resolution-options">
          <div
            className={`resolution-option ${correctChoice === '0' ? 'selected' : 'clickable'}`}
            onClick={() => handleOptionClick('0')}
          >
            <strong>{wagerOptions.options[0]}</strong>
            <span className="odds-display">{wagerOptions.odds[0] || 1}:1</span>
          </div>
          <div
            className={`resolution-option ${correctChoice === '1' ? 'selected' : 'clickable'}`}
            onClick={() => handleOptionClick('1')}
          >
            <strong>{wagerOptions.options[1]}</strong>
            <span className="odds-display">{wagerOptions.odds[1] || 1}:1</span>
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
