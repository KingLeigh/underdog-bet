import React, { useState, useEffect, useRef } from 'react'
import {
  rng,
  generateSeed,
  shuffle,
  createCostFunction,
  buildChallenges,
  solveMatchmaking,
  checkFeasible,
  optimizeMatchOrdering
} from '../lib/matchmakerSolver'
import { buildMatchmakerConfigUrl } from '../lib/matchmakerUrl'
import './Matchmaker.css'

function Matchmaker() {
  const [numPlayers, setNumPlayers] = useState(8)
  const [categories, setCategories] = useState([
    { name: 'Trivia', count: 4 },
    { name: 'Cardio', count: 4 }
  ])
  const [numTrials, setNumTrials] = useState(25)
  const [targetGap, setTargetGap] = useState(2)
  const [playerGrid, setPlayerGrid] = useState([])
  const [simStatus, setSimStatus] = useState('')
  const [simResult, setSimResult] = useState('')
  const [simRunning, setSimRunning] = useState(false)
  const [solveStatus, setSolveStatus] = useState('')
  const [matchups, setMatchups] = useState(null) // [{ number, category, high, low, matchup }]
  const [solveError, setSolveError] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const [isUrlLoaded, setIsUrlLoaded] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isViewOnlyMode, setIsViewOnlyMode] = useState(false)
  const [gapMode, setGapMode] = useState('loose') // 'loose' or 'strict'
  const cancelSimRef = useRef(false)

  // Sample category names
  const sampleCategories = ['Trivia', 'Cardio', 'Brain Games', 'Hand Eye Coordination', 'Luck', 'Memory', 'Strength', 'Drinking', 'Spelling', 'Balance', 'Counting', 'Agility', 'Timing', 'Estimation', 'Observation', 'Throwing', 'Catching', 'Accuracy', 'Precision']

  // Sample player names
  const sampleNames = ['Leigh', 'Andy', 'Kirsten', 'Brett', 'Steff', 'Talpos', 'Ves', 'Gage', 'Miles', 'Elliot', 'Libby', 'Caitlin']

  const addCategory = (name = '', count = 1) => {
    if (!name) {
      const existingCategories = categories.map(c => c.name)
      const availableCategories = sampleCategories.filter(cat => !existingCategories.includes(cat))
      if (availableCategories.length > 0) {
        name = availableCategories[Math.floor(Math.random() * availableCategories.length)]
      } else {
        let fallbackNum = 1
        while (existingCategories.includes(`Category ${fallbackNum}`)) {
          fallbackNum++
        }
        name = `Category ${fallbackNum}`
      }
    }

    setCategories([...categories, { name, count }])
  }

  const removeCategory = (index) => {
    setCategories(categories.filter((_, i) => i !== index))
  }

  const updateCategory = (index, field, value) => {
    const updated = [...categories]
    updated[index] = { ...updated[index], [field]: value }
    setCategories(updated)
  }

  const buildPlayerGrid = () => {
    if (categories.length < 1) {
      alert('Add at least one category.')
      return
    }

    const challenges = buildChallenges(categories)
    if (challenges.length < numPlayers) {
      alert(`Not enough challenges! You have ${challenges.length} challenges but need at least ${numPlayers} for ${numPlayers} players.`)
      return
    }

    const availableNames = [...sampleNames]
    shuffle(availableNames, Math.random)

    const newPlayerGrid = []
    for (let i = 0; i < numPlayers; i++) {
      const playerName = i < availableNames.length ? availableNames[i] : `Player ${i+1}`
      newPlayerGrid.push({ name: playerName, ranks: {} })
    }

    setPlayerGrid(newPlayerGrid)

    // Update target gap if not user-touched
    const suggested = Math.max(1, Math.ceil(categories.length/2))
    setTargetGap(suggested)
  }

  const randomizeRanks = () => {
    if (categories.length < 1) {
      alert('Add at least one category first.')
      return
    }

    if (playerGrid.length === 0) {
      alert('Build the player grid first.')
      return
    }

    // Always generate a new seed when randomizing ranks
    const newSeed = generateSeed()

    const M = categories.length
    const updatedGrid = playerGrid.map((player, playerIndex) => {
      const ranks = {}
      const rankValues = Array.from({length: M}, (_, i) => i + 1)
      // Create a unique seed for each player by combining the new seed with player index
      const playerSeed = newSeed + playerIndex * 1000
      shuffle(rankValues, rng(playerSeed))

      categories.forEach((cat, index) => {
        ranks[cat.name] = rankValues[index]
      })

      return { ...player, ranks }
    })

    setPlayerGrid(updatedGrid)
  }

  // Simulation and solving functions
  const runSimulation = async () => {
    const challenges = buildChallenges(categories)
    const total = challenges.length
    if (total < numPlayers) {
      alert(`Not enough challenges! You have ${total} challenges but need at least ${numPlayers} for ${numPlayers} players.`)
      return
    }
    const M = categories.length
    if (M < 1) { alert('Add at least one category.'); return }

    const trials = Math.max(10, numTrials || 1000)
    const rand = rng()
    cancelSimRef.current = false
    setSimRunning(true)
    setSimStatus('Running…')
    setSimResult('')

    let infeasible = 0
    let cancelled = false
    for (let t=0; t<trials; t++) {
      if (cancelSimRef.current) { cancelled = true; break }
      const players = Array.from({length:numPlayers}, (_,i)=>({
        name: `P${i+1}`,
        ranks: (()=>{
          const perm = shuffle([...Array(M).keys()], rand)
          const obj = {}
          for (let k=0;k<M;k++) obj[categories[perm[k]].name] = k+1
          return obj
        })()
      }))
      if (!checkFeasible(players, categories.map(c=>c.name), challenges, { selectN: numPlayers, requireCoverAll: false })) infeasible++
      if ((t+1) % Math.ceil(trials/10) === 0) {
        setSimStatus(`Progress: ${t+1}/${trials}`)
        await new Promise(r=>setTimeout(r))
      }
    }
    setSimRunning(false)
    const ran = cancelled ? ' (cancelled early)' : ''
    const pct = (infeasible / trials) * 100
    setSimResult(`Infeasible: ${infeasible} / ${trials}${ran} → ${pct.toFixed(2)}%`)
    setSimStatus('Done')
  }

  const readPlayersFromGrid = () => {
    const M = categories.length
    if (!playerGrid.length) return { ok: false, reason: 'Build the player grid first.' }
    const players = []
    for (const player of playerGrid) {
      const name = player.name.trim() || `Player ${players.length+1}`
      const ranks = {}
      for (let i=0;i<M;i++) {
        const v = player.ranks[categories[i].name]
        if (!Number.isInteger(v) || v < 1 || v > M) return { ok: false, reason: `${name}: ranks must be integers from 1..${M}.` }
        ranks[categories[i].name] = v
      }
      players.push({ name, ranks })
    }
    for (const p of players) {
      const vals = categories.map(c=>p.ranks[c.name]).slice().sort((a,b)=>a-b)
      for (let k=1;k<=M;k++) if (vals[k-1] !== k) return { ok: false, reason: `${p.name}: ranks must be a permutation of 1..${M}.` }
    }
    return { ok: true, players, categories: categories.map(c=>c.name), challenges: buildChallenges(categories) }
  }

  const solveFromGrid = () => {
    // Generate a new seed for matchmaking to ensure different results each time
    const newSeed = generateSeed()

    const parsed = readPlayersFromGrid()
    setMatchups(null)
    setSolveError('')
    if (!parsed.ok) {
      setSolveError(`Error: ${parsed.reason}`)
      return
    }

    if (parsed.challenges.length < numPlayers) {
      setSolveError(`Not enough challenges! You have ${parsed.challenges.length} challenges but need at least ${numPlayers} for ${numPlayers} players.`)
      return
    }

    setSolveStatus('Checking feasibility…')
    const feasible = checkFeasible(parsed.players, parsed.categories, parsed.challenges, {
      timeLimitMs: 2000,
      selectN: numPlayers,
      requireCoverAll: false
    })

    if (!feasible) {
      setSolveStatus('')
      setSolveError('No feasible assignment found.')
      return
    }

    const targetGapValue = targetGap || Math.ceil(parsed.categories.length/2)
    setSolveStatus('Solving…')

    // Create cost function based on gap mode
    const rand = rng(newSeed)
    const costFn = createCostFunction(targetGapValue, gapMode, rand)

    const res = solveMatchmaking(parsed.players, parsed.categories, parsed.challenges, {
      targetGap: targetGapValue,
      timeLimitMs: 10000,  // 10 second timeout to prevent UI freezing
      costFn: costFn,
      selectN: numPlayers,
      coverPenaltyPerMissing: 10,
      requireCoverAll: false,
      randomSeed: newSeed
    })

    setSolveStatus('')
    if (!res.ok) {
      setSolveError(`Error: ${res.reason}`)
      return
    }

    const optimizedAssignments = optimizeMatchOrdering(res.assignments, newSeed)

    setMatchups(optimizedAssignments.map((a, index) => ({
      number: index + 1,
      category: a.category,
      high: a.high,
      low: a.low,
      matchup: `${a.highRank} vs ${a.lowRank}`
    })))
  }

  // Copy a share URL to the clipboard (with prompt fallback) and navigate to it
  const copyAndVisit = (url, successMessage) => {
    navigator.clipboard.writeText(url).then(() => {
      setShareStatus(successMessage)
      setTimeout(() => setShareStatus(''), 3000)
      window.location.href = url
    }).catch(() => {
      prompt('Share this URL:', url)
      setShareStatus('URL generated!')
      setTimeout(() => setShareStatus(''), 3000)
      window.location.href = url
    })
  }

  // Build the ?data= config URL from the current grid, or null if invalid
  const buildConfigUrl = () => {
    if (!categories.length) {
      alert('Please add at least one category before saving.')
      return null
    }

    const parsed = readPlayersFromGrid()
    if (!parsed.ok) {
      alert(`Cannot share: ${parsed.reason}`)
      return null
    }

    const baseUrl = window.location.origin + window.location.pathname
    return buildMatchmakerConfigUrl(
      baseUrl,
      categories.map(c => c.name),
      categories.map(c => c.count),
      parsed.players.map(p => p.name),
      parsed.players.map(p => categories.map(cat => p.ranks[cat.name]))
    )
  }

  const generateShareUrl = () => {
    try {
      // If we have matchups already generated, use the more efficient ?save approach
      if (matchups && matchups.length > 0) {
        return generateMatchupsUrl()
      }

      const url = buildConfigUrl()
      if (url) copyAndVisit(url, 'URL copied to clipboard!')
    } catch (error) {
      console.error('Error generating share URL:', error)
      setShareStatus('Error generating URL')
      setTimeout(() => setShareStatus(''), 3000)
    }
  }

  const generateMatchupsUrl = () => {
    try {
      if (!matchups || matchups.length === 0) {
        alert('No matchups to save. Please generate matches first.')
        return
      }

      // Create compact matchup data using colon-separated format
      // Format: number:category:high:low:matchup
      const compactMatchups = matchups.map((m) =>
        `${m.number}:${m.category}:${m.high}:${m.low}:${m.matchup}`
      ).join('|')

      const baseUrl = window.location.origin + window.location.pathname
      const shareUrl = `${baseUrl}?save=${btoa(compactMatchups)}`
      copyAndVisit(shareUrl, 'Matchups URL copied to clipboard!')
    } catch (error) {
      console.error('Error generating matchups URL:', error)
      setShareStatus('Error generating matchups URL')
      setTimeout(() => setShareStatus(''), 3000)
    }
  }

  const saveConfig = () => {
    try {
      const url = buildConfigUrl()
      if (url) copyAndVisit(url, 'Config URL copied to clipboard!')
    } catch (error) {
      console.error('Error generating config URL:', error)
      setShareStatus('Error generating config URL')
      setTimeout(() => setShareStatus(''), 3000)
    }
  }

  const toggleLock = () => {
    setIsUnlocked(!isUnlocked)
  }

  const isFormLocked = isUrlLoaded && !isUnlocked

  // URL parameter parsing for pre-populated data
  const parseUrlData = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const dataParam = urlParams.get('data')
    const saveParam = urlParams.get('save')
    const categoriesParam = urlParams.get('categories')
    const countsParam = urlParams.get('counts')
    const unlockedParam = urlParams.get('unlocked')

    // Handle categories and counts parameters (from Challenge Selector)
    if (categoriesParam && countsParam) {
      try {
        const categoriesList = categoriesParam.split(',')
        const countsList = countsParam.split(',').map(count => parseInt(count.trim()))

        if (categoriesList.length !== countsList.length) {
          throw new Error(`Mismatch: ${categoriesList.length} categories but ${countsList.length} counts`)
        }

        const newCategories = categoriesList.map((name, index) => ({
          name: name.trim(),
          count: countsList[index]
        }))

        setCategories(newCategories)
        setIsUrlLoaded(true)

        // If unlocked=true, keep fields editable
        if (unlockedParam === 'true') {
          setIsUnlocked(true)
        }

        return // Exit early, don't process other parameters

      } catch (error) {
        console.error('Error parsing categories/counts from URL:', error.message)
        alert(`Error loading categories/counts from URL: ${error.message}\n\nUsing default configuration instead.`)
      }
    }

    // Handle ?save parameter (pre-generated matchups)
    if (saveParam) {
      try {
        const decodedMatchups = atob(saveParam)

        // Parse compact format: number:category:high:low:matchup|number:category:high:low:matchup|...
        // Rendered as React data, never as raw HTML, so a crafted URL cannot inject markup.
        const loadedMatchups = decodedMatchups.split('|').map(matchupStr => {
          const [number, category, high, low, matchup] = matchupStr.split(':')
          return {
            number: parseInt(number),
            category,
            high,
            low,
            matchup
          }
        })

        setMatchups(loadedMatchups)
        setIsViewOnlyMode(true) // Enable view-only mode to hide other panels
        setIsUrlLoaded(true)

        return

      } catch (error) {
        console.error('Error parsing ?save parameter:', error.message)
        alert(`Error loading saved matchups: ${error.message}\n\nUsing default configuration instead.`)
      }
    }

    if (!dataParam) {
      // No URL data, categories already initialized with defaults
      setIsUrlLoaded(false)
      return
    }

    try {
      // Decode base64 data
      const decodedData = atob(dataParam)

      // Parse the format: categories|challengeCounts|players|player1ranks|player2ranks|...
      const sections = decodedData.split('|')

      if (sections.length < 4) {
        throw new Error('Invalid data format: need at least categories, challenge counts, players, and one player\'s ranks')
      }

      const categoriesList = sections[0].split(',').filter(cat => cat.trim())
      const challengeCounts = sections[1].split(',').map(c => parseInt(c.trim()))
      const players = sections[2].split(',').filter(player => player.trim())

      if (categoriesList.length === 0) {
        throw new Error('No categories found')
      }

      if (players.length === 0) {
        throw new Error('No players found')
      }

      if (challengeCounts.length !== categoriesList.length) {
        throw new Error(`Expected ${categoriesList.length} challenge counts, got ${challengeCounts.length}`)
      }

      if (sections.length - 3 !== players.length) {
        throw new Error(`Expected ${players.length} rank sections, got ${sections.length - 3}`)
      }

      // Clear existing categories and set new ones
      const newCategories = categoriesList.map((cat, index) => ({
        name: cat.trim(),
        count: challengeCounts[index]
      }))
      setCategories(newCategories)

      // Set number of players
      setNumPlayers(players.length)

      // Build player grid with loaded data
      const newPlayerGrid = []
      for (let i = 0; i < players.length; i++) {
        const rankSection = sections[i + 3]
        const ranks = rankSection.split(',').map(r => parseInt(r.trim()))

        if (ranks.length !== categoriesList.length) {
          throw new Error(`Player ${i + 1} has ${ranks.length} ranks but there are ${categoriesList.length} categories`)
        }

        const playerRanks = {}
        categoriesList.forEach((cat, j) => {
          playerRanks[cat] = ranks[j]
        })

        newPlayerGrid.push({
          name: players[i].trim(),
          ranks: playerRanks
        })
      }

      setPlayerGrid(newPlayerGrid)

      // Update target gap
      const suggested = Math.max(1, Math.ceil(categoriesList.length/2))
      setTargetGap(suggested)

      setIsUrlLoaded(true)

    } catch (error) {
      console.error('Error parsing URL data:', error.message)
      alert(`Error loading data from URL: ${error.message}\n\nUsing default configuration instead.`)

      // Fall back to default categories (already initialized)
      setIsUrlLoaded(false)
    }
  }

  // Initialize with URL data on component mount
  useEffect(() => {
    parseUrlData()
  }, []) // Empty dependency array means this runs once on mount


  const totalChallenges = categories.reduce((sum, cat) => {
    const count = typeof cat.count === 'string' ? parseInt(cat.count) || 0 : cat.count
    return sum + count
  }, 0)

  return (
    <div className="matchmaker">
      <div className="matchmaker-content">
        <div className="matchmaker-header">
          <h1>Matchmaker</h1>
        </div>

        {/* Game Setup Section */}
        {!isViewOnlyMode && (
        <div className="game-setup-section panel-spacing">
          <div className="setup-panel standard-panel">
            <h2>Game Setup</h2>

            <div className="top-controls">
              {isUrlLoaded && (
                <div className="lock-toggle">
                  <button
                    className={`btn ${isUnlocked ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={toggleLock}
                  >
                    {isUnlocked ? '🔒 Lock' : '🔓 Unlock'}
                  </button>
                </div>
              )}
            </div>

            <div className="setup-controls">
              <div className="form-group">
                <label>Number of Players</label>
            <input
              type="number"
              min="2"
              value={numPlayers}
              disabled={isFormLocked}
              onChange={(e) => setNumPlayers(parseInt(e.target.value) || 2)}
            />
              </div>
            </div>

            <div className="categories-section">
              <h4>Categories</h4>

              <table className="categories-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Num Challenges ({totalChallenges})</th>
                    {!isFormLocked && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="text"
                          value={category.name}
                          placeholder="Category name"
                          disabled={isFormLocked}
                          onChange={(e) => updateCategory(index, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                      <input
                        type="number"
                        value={category.count}
                        disabled={isFormLocked}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '') {
                            updateCategory(index, 'count', '')
                          } else {
                            const numValue = parseInt(value)
                            if (!isNaN(numValue) && numValue > 0) {
                              updateCategory(index, 'count', numValue)
                            }
                          }
                        }}
                      />
                      </td>
                      <td>
                      {!isFormLocked && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => removeCategory(index)}
                        >
                          Remove
                        </button>
                      )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="section-actions">
              {!isFormLocked && (
                <button className="btn btn-secondary" onClick={() => addCategory()}>
                  + Add Category
                </button>
              )}
              </div>

              {totalChallenges < numPlayers && (
                <div className="validation-message">
                  You need at least as many Challenges as players
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Simulation Section */}
        {!isViewOnlyMode && !isUrlLoaded && (
        <div className="simulation-section panel-spacing">
          <div className="simulation-panel standard-panel">
            <h2>Simulation</h2>

            <div className="simulation-controls">
              <div className="form-group">
                <label>Trials</label>
                <input
                  type="number"
                  min="10"
                  value={numTrials}
                  onChange={(e) => setNumTrials(parseInt(e.target.value) || 25)}
                />
              </div>

              <div className="simulation-actions">
                <button className="btn btn-primary" disabled={simRunning} onClick={runSimulation}>
                  Run Simulation
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={!simRunning}
                  onClick={() => { cancelSimRef.current = true }}
                >
                  Cancel
                </button>
              </div>

              {simStatus && <div className="status-message">{simStatus}</div>}
            </div>

            {simResult && (
              <div className="simulation-result">{simResult}</div>
            )}
          </div>
        </div>
        )}

        {/* Player Rankings Section */}
        {!isViewOnlyMode && (
        <div className="player-rankings-section panel-spacing standard-panel">
          <h2>Player Rankings</h2>

          <div className="player-controls">
            {!isFormLocked && (
              <button className="btn btn-primary" onClick={buildPlayerGrid}>
                Build / Refresh Player Grid
              </button>
            )}
            {!isFormLocked && (
              <button className="btn btn-secondary" onClick={randomizeRanks}>
                Randomize Ranks
              </button>
            )}
          </div>

          {playerGrid.length > 0 && (
            <div className="player-grid">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player Name</th>
                    {categories.map(cat => (
                      <th key={cat.name}>{cat.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playerGrid.map((player, index) => (
                    <tr key={index}>
                      <td className="player-number">{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={player.name}
                          disabled={isFormLocked}
                          onChange={(e) => {
                            const updated = [...playerGrid]
                            updated[index] = { ...updated[index], name: e.target.value }
                            setPlayerGrid(updated)
                          }}
                        />
                      </td>
                      {categories.map(cat => (
                        <td key={cat.name}>
                          <input
                            type="number"
                            min="1"
                            max={categories.length}
                            value={player.ranks[cat.name] || ''}
                            placeholder={`1..${categories.length}`}
                            disabled={isFormLocked}
                            onChange={(e) => {
                              const updated = [...playerGrid]
                              updated[index] = {
                                ...updated[index],
                                ranks: { ...updated[index].ranks, [cat.name]: parseInt(e.target.value) || '' }
                              }
                              setPlayerGrid(updated)
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="optimization-controls">
            <div className="form-group">
              <label>Spacing Target</label>
              <input
                type="number"
                min="1"
                value={targetGap}
                onChange={(e) => setTargetGap(parseInt(e.target.value) || 2)}
              />
            </div>
            <div className="form-group">
              <label>Gap Mode</label>
              <select
                value={gapMode}
                onChange={(e) => setGapMode(e.target.value)}
                className="gap-mode-select"
              >
                <option value="strict">Strict</option>
                <option value="loose">Loose</option>
                <option value="chaos">Chaos</option>
              </select>
            </div>
          </div>

          <div className="matchmaking-actions">
            <button className="btn btn-primary" onClick={solveFromGrid}>
              Make Matches
            </button>
            <button className="btn btn-secondary" onClick={saveConfig}>
              Save Config
            </button>
            {solveStatus && <div className="status-message">{solveStatus}</div>}
          </div>
        </div>
        )}

        {/* Match Ups Section */}
        {((matchups && matchups.length > 0) || solveError) && (
          <div className="matchups-section panel-spacing">
            <div className="matchups-panel standard-panel">
              <h2>Matchups</h2>
              <div className="matchmaking-results">
                {solveError && (
                  <div className="validation-message">{solveError}</div>
                )}
                {matchups && matchups.length > 0 && (
                  <table>
                    <thead>
                      <tr><th>#</th><th>Category</th><th>Favorite</th><th>Underdog</th><th>Matchup</th></tr>
                    </thead>
                    <tbody>
                      {matchups.map((m) => (
                        <tr key={m.number}>
                          <td>{m.number}</td>
                          <td>{m.category}</td>
                          <td><strong>{m.high}</strong></td>
                          <td>{m.low}</td>
                          <td>{m.matchup}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {!isViewOnlyMode && matchups && matchups.length > 0 && (
                <div className="matchups-actions" style={{ marginTop: '20px' }}>
                  <button className="btn btn-primary" onClick={generateShareUrl}>
                    💾 Save
                  </button>
                  {shareStatus && <div className="status-message">{shareStatus}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Matchmaker
