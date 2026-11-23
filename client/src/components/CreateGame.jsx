import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import MatchupSafetyMeter from './MatchupSafetyMeter'
import './CreateGame.css'

// Chunky -/+ control used for all the numeric game settings.
// onStep receives a delta and the owner applies it functionally, so rapid
// clicks can never collapse into a single step.
function Stepper({ label, value, display, step, min, max, onStep }) {
  return (
    <div className="cg-stepper">
      <div className="cg-stepper-label">{label}</div>
      <div className="odds-stepper big">
        <button type="button" onClick={() => onStep(-step)} disabled={value <= min}>−</button>
        <span>{display !== undefined ? display : value}</span>
        <button type="button" onClick={() => onStep(step)} disabled={value >= max}>+</button>
      </div>
    </div>
  )
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function CreateGame() {
  const [searchParams] = useSearchParams()
  const [createPlayerName, setCreatePlayerName] = useState('')
  const [hostPlays, setHostPlays] = useState(false) // host-only by default
  const [categories, setCategories] = useState('')
  const [challengeCounts, setChallengeCounts] = useState({}) // category name -> count
  const [startingPoints, setStartingPoints] = useState(100)
  const [minBalance, setMinBalance] = useState(10)
  const [maxBet, setMaxBet] = useState(0) // 0 = no limit
  const [bounty, setBounty] = useState('None')
  const [bountyAmount, setBountyAmount] = useState(25)
  const [isPreFilled, setIsPreFilled] = useState(false)

  const navigate = useNavigate()
  const { createGame, currentGame, gameState, error, clearError } = useGame()

  // The minimum balance can never exceed the starting points
  useEffect(() => {
    setMinBalance(m => Math.min(m, startingPoints))
  }, [startingPoints])

  // Parse URL parameters and pre-fill the category fields (Challenge List flow)
  useEffect(() => {
    const categoriesParam = searchParams.get('categories')
    const countsParam = searchParams.get('counts')

    if (categoriesParam && countsParam) {
      setCategories(categoriesParam)
      const names = categoriesParam.split(',').map(c => c.trim())
      const counts = countsParam.split(',').map(c => parseInt(c.trim()))
      const map = {}
      names.forEach((name, i) => { map[name] = counts[i] || 1 })
      setChallengeCounts(map)
      setIsPreFilled(true)
    } else {
      setIsPreFilled(false)
    }
  }, [searchParams])

  const catList = categories.split(',').map(c => c.trim()).filter(c => c.length > 0)
  const countFor = (name) => challengeCounts[name] || 1
  const stepCount = (name, delta) =>
    setChallengeCounts(prev => ({ ...prev, [name]: clamp((prev[name] || 1) + delta, 1, 9) }))

  // Validation: category names must be unique
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

  const handleCreateGame = (e) => {
    e.preventDefault()

    if (!validateUniqueCategories().isValid) {
      return
    }

    createGame({
      playerName: hostPlays ? createPlayerName : 'Host',
      hostPlays: hostPlays,
      categories: catList,
      challengesPerCategory: catList.map(name => countFor(name)),
      startingPoints: startingPoints,
      minBalance: minBalance,
      maxBetSize: maxBet === 0 ? null : maxBet,
      bounty: bounty,
      bountyAmount: bounty === 'Fixed' ? bountyAmount : null
    })
  }

  // Auto-navigate when the game is created
  useEffect(() => {
    if (currentGame && gameState) {
      navigate(`/lobby/${currentGame}`)
    }
  }, [currentGame, gameState, navigate])

  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [error, clearError])

  const dupes = validateUniqueCategories()

  return (
    <div className="create-game">
      <form className="create-content" onSubmit={handleCreateGame}>
        <div className="round-strip">New Game</div>
        <h1 className="create-title">Set the Table</h1>

        <section className="cg-section">
          <div className="cg-label">You are</div>
          <div className="cat-pills">
            <button type="button" className={`cat-pill ${!hostPlays ? 'on' : ''}`} onClick={() => setHostPlays(false)}>
              Hosting only
            </button>
            <button type="button" className={`cat-pill ${hostPlays ? 'on' : ''}`} onClick={() => setHostPlays(true)}>
              Playing
            </button>
          </div>
          {!hostPlays && (
            <div className="cg-help">
              Emcee mode: you run contests and judge winners, but don't bet and don't appear on the leaderboard.
            </div>
          )}
          {hostPlays && (
            <>
              <div className="cg-label">Your name</div>
              <input
                type="text"
                value={createPlayerName}
                onChange={(e) => setCreatePlayerName(e.target.value)}
                placeholder="Your name"
                className="stage-input"
                required
              />
            </>
          )}
        </section>

        <section className="cg-section">
          <div className="cg-label">Chips</div>
          <div className="cg-steppers">
            <Stepper
              label="Starting points"
              value={startingPoints}
              step={25}
              min={25}
              max={1000}
              onStep={(d) => setStartingPoints(s => clamp(s + d, 25, 1000))}
            />
            <Stepper
              label="Minimum balance"
              value={minBalance}
              display={minBalance === 0 ? 'Bust!' : minBalance}
              step={5}
              min={0}
              max={startingPoints}
              onStep={(d) => setMinBalance(m => clamp(m + d, 0, startingPoints))}
            />
            <Stepper
              label="Max bet"
              value={maxBet}
              display={maxBet === 0 ? 'No limit' : maxBet}
              step={10}
              min={0}
              max={1000}
              onStep={(d) => setMaxBet(m => clamp(m + d, 0, 1000))}
            />
          </div>
          <div className="cg-help">
            Players can never drop below the minimum balance — set it to 0 to allow busting out.
          </div>
        </section>

        <section className="cg-section">
          <div className="cg-label">Bounty for contest winners</div>
          <div className="cat-pills">
            {['None', 'Fixed', 'Average', 'Min', 'Max'].map(option => (
              <button
                type="button"
                key={option}
                className={`cat-pill ${bounty === option ? 'on' : ''}`}
                onClick={() => setBounty(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {bounty === 'Fixed' && (
            <div className="cg-steppers">
              <Stepper
                label="Bounty amount"
                value={bountyAmount}
                step={5}
                min={5}
                max={500}
                onStep={(d) => setBountyAmount(a => clamp(a + d, 5, 500))}
              />
            </div>
          )}
          {bounty !== 'None' && bounty !== 'Fixed' && (
            <div className="cg-help">
              The winner also receives the {bounty.toLowerCase()} of all bets placed on the contest.
            </div>
          )}
        </section>

        <section className="cg-section">
          <div className="cg-label">Categories (optional)</div>
          <input
            type="text"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="Speed, Luck, Trivia…"
            className="stage-input cg-text"
            disabled={isPreFilled}
          />
          <div className="cg-help">
            Comma-separated. Players rank themselves in each category before the game starts.
          </div>
          {!dupes.isValid && (
            <div className="error-message">
              Duplicate categories: {dupes.duplicates.join(', ')} — names must be unique.
            </div>
          )}

          {catList.length > 0 && dupes.isValid && (
            <>
              <div className="cg-label">Challenges per category</div>
              <div className="cat-count-chips">
                {catList.map(name => (
                  <div key={name} className="cat-count-chip">
                    <span className="ccc-name">{name}</span>
                    <div className="odds-stepper tiny">
                      <button
                        type="button"
                        onClick={() => stepCount(name, -1)}
                        disabled={isPreFilled || countFor(name) <= 1}
                      >−</button>
                      <span>{countFor(name)}</span>
                      <button
                        type="button"
                        onClick={() => stepCount(name, 1)}
                        disabled={isPreFilled || countFor(name) >= 9}
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {dupes.isValid && catList.length > 0 && (
            <MatchupSafetyMeter cats={catList.map(name => ({ name, count: countFor(name) }))} />
          )}
        </section>

        <button
          type="submit"
          className="mega-btn create-btn"
          disabled={!dupes.isValid}
        >
          CREATE GAME ★
        </button>
        <button type="button" className="back-link" onClick={() => navigate('/')}>
          ← Back to home
        </button>

        {error && <div className="error-message">{error}</div>}
      </form>
    </div>
  )
}

export default CreateGame
