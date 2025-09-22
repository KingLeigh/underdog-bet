import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import './CreateGame.css'

function CreateGame() {
  const [searchParams] = useSearchParams()
  const [createPlayerName, setCreatePlayerName] = useState('')
  const [categories, setCategories] = useState('')
  const [challengesPerCategory, setChallengesPerCategory] = useState('')
  const [startingPoints, setStartingPoints] = useState(100)
  const [maxBetSize, setMaxBetSize] = useState('')
  const [bounty, setBounty] = useState('None')
  const [bountyAmount, setBountyAmount] = useState('')
  const [isPreFilled, setIsPreFilled] = useState(false)
  
  const navigate = useNavigate()
  const { createGame, currentGame, gameState, error, clearError } = useGame()

  // Parse URL parameters and pre-fill form fields, or auto-fill based on categories
  useEffect(() => {
    const categoriesParam = searchParams.get('categories')
    const countsParam = searchParams.get('counts')
    
    // If we have URL parameters, use them (only run once when URL params change)
    if (categoriesParam && countsParam) {
      setCategories(categoriesParam)
      setChallengesPerCategory(countsParam)
      setIsPreFilled(true)
    } else {
      setIsPreFilled(false)
    }
  }, [searchParams])

  // Auto-fill challenges when categories change (only if no URL parameters)
  useEffect(() => {
    const categoriesParam = searchParams.get('categories')
    const countsParam = searchParams.get('counts')
    
    // Only auto-fill if we don't have URL parameters
    if (!categoriesParam && !countsParam) {
      if (categories.trim()) {
        const categoryCount = categories.split(',').filter(cat => cat.trim()).length
        if (categoryCount > 0) {
          const defaultChallenges = Array(categoryCount).fill('1').join(',')
          setChallengesPerCategory(defaultChallenges)
        }
      } else {
        setChallengesPerCategory('')
      }
    }
  }, [categories, searchParams])

  // Validation function to check for unique category names
  const validateUniqueCategories = () => {
    if (!categories.trim()) {
      return { isValid: true, duplicates: [] }
    }
    
    const categoryList = categories.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0)
    const duplicates = []
    const seen = new Set()
    
    categoryList.forEach(category => {
      if (seen.has(category.toLowerCase())) {
        duplicates.push(category)
      } else {
        seen.add(category.toLowerCase())
      }
    })
    
    return { isValid: duplicates.length === 0, duplicates }
  }

  // Validation function for challenges per category
  const validateChallengesInput = () => {
    if (!categories.trim()) {
      // If no categories, challenges should be empty
      return challengesPerCategory.trim() === ''
    }
    
    const categoryCount = categories.split(',').filter(cat => cat.trim()).length
    if (categoryCount === 0) {
      return challengesPerCategory.trim() === ''
    }
    
    // Check if challenges input is empty when categories exist
    if (!challengesPerCategory.trim()) {
      return false
    }
    
    // Split challenges and validate each is a number
    const challengesList = challengesPerCategory.split(',').map(challenge => challenge.trim())
    
    // Check length matches category count
    if (challengesList.length !== categoryCount) {
      return false
    }
    
    // Check each challenge is a valid number
    return challengesList.every(challenge => {
      const num = parseInt(challenge)
      return !isNaN(num) && num > 0 && challenge === num.toString()
    })
  }

  const handleCreateGame = (e) => {
    e.preventDefault()
    
    // Validate unique categories before proceeding
    const categoryValidation = validateUniqueCategories()
    if (!categoryValidation.isValid) {
      return
    }
    
    // Validate challenges input before proceeding
    if (!validateChallengesInput()) {
      return
    }
    
    // Parse categories from comma-separated string
    const categoriesList = categories.trim() 
      ? categories.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0)
      : []
    
    // Parse max bet size - convert to number if provided, otherwise null
    const maxBetValue = maxBetSize.trim() ? parseInt(maxBetSize) : null
    
    // Parse bounty amount - convert to number if Fixed bounty is selected
    const bountyAmountValue = bounty === 'Fixed' && bountyAmount.trim() ? parseInt(bountyAmount) : null
    
    // Parse challenges per category - convert to array of numbers
    const challengesList = challengesPerCategory.trim() 
      ? challengesPerCategory.split(',').map(challenge => parseInt(challenge.trim())).filter(num => !isNaN(num))
      : []
    
    console.log('🎮 Sending createGame with:', { 
      playerName: createPlayerName,
      categories: categoriesList,
      challengesPerCategory: challengesList,
      startingPoints: startingPoints === '' ? 100 : startingPoints,
      maxBetSize: maxBetValue,
      bounty: bounty,
      bountyAmount: bountyAmountValue
    })
    
    createGame({ 
      playerName: createPlayerName,
      categories: categoriesList,
      challengesPerCategory: challengesList,
      startingPoints: startingPoints === '' ? 100 : startingPoints,
      maxBetSize: maxBetValue,
      bounty: bounty,
      bountyAmount: bountyAmountValue
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
          <div className="form-section standard-panel">
            <h2>Player</h2>
            
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
          </div>

          <div className="form-section standard-panel">
            <h2>Betting Options</h2>
            
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
              <label htmlFor="bounty">Bounty:</label>
              <select
                id="bounty"
                name="bounty"
                value={bounty}
                onChange={(e) => setBounty(e.target.value)}
                className="bounty-select"
              >
                <option value="None">None</option>
                <option value="Fixed">Fixed</option>
                <option value="Average">Average</option>
                <option value="Min">Min</option>
                <option value="Max">Max</option>
              </select>
              <small className="form-help">
                Configure bounty settings for the game.
              </small>
            </div>
            
            {bounty === 'Fixed' && (
              <div className="form-group">
                <label htmlFor="bountyAmount">Bounty Amount:</label>
                <input
                  type="number"
                  id="bountyAmount"
                  name="bountyAmount"
                  value={bountyAmount}
                  onChange={(e) => setBountyAmount(e.target.value)}
                  min="1"
                  max="10000"
                  className="bounty-amount-input"
                  placeholder="Enter bounty amount"
                  required
                />
                <small className="form-help">
                  The fixed amount of points to be awarded as bounty to the winner.
                </small>
              </div>
            )}
          </div>

          <div className="form-section standard-panel">
            <h2>Game Categories</h2>
            
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
                disabled={isPreFilled}
              />
              <small className="form-help">
                Comma-separated list of categories for player ranking. Players will rank themselves 1-N in each category before the game starts.
              </small>
              {!validateUniqueCategories().isValid && (
                <div className="error-message">
                  <strong>Duplicate categories found:</strong> {validateUniqueCategories().duplicates.join(', ')}. Please ensure all category names are unique.
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="challengesPerCategory">Num Challenges per Category:</label>
              <input
                type="text"
                id="challengesPerCategory"
                name="challengesPerCategory"
                value={challengesPerCategory}
                onChange={(e) => setChallengesPerCategory(e.target.value)}
                placeholder="1,1,1,1"
                className="challenges-input"
                disabled={isPreFilled}
              />
              <small className="form-help">
                Comma-separated list of challenge counts for each category. Each number represents how many challenges will be created for that category.
              </small>
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="submit" 
              className="btn btn-primary btn-large"
              disabled={!validateChallengesInput() || !validateUniqueCategories().isValid}
            >
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
