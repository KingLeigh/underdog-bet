import React, { useState, useEffect } from 'react'
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
  const [solveStatus, setSolveStatus] = useState('')
  const [solveOutput, setSolveOutput] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const [cancelSimFlag, setCancelSimFlag] = useState(false)
  const [isUrlLoaded, setIsUrlLoaded] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isViewOnlyMode, setIsViewOnlyMode] = useState(false)
  const [currentAssignments, setCurrentAssignments] = useState(null)
  const [gapMode, setGapMode] = useState('loose') // 'loose' or 'strict'

  // Sample category names
  const sampleCategories = ['Trivia', 'Cardio', 'Brain Games', 'Hand Eye Coordination', 'Luck', 'Memory', 'Strength', 'Drinking', 'Spelling', 'Balance', 'Counting', 'Agility', 'Timing', 'Estimation', 'Observation', 'Throwing', 'Catching', 'Accuracy', 'Precision']

  // Sample player names
  const sampleNames = ['Leigh', 'Andy', 'Kirsten', 'Brett', 'Steff', 'Talpos', 'Ves', 'Gage', 'Miles', 'Elliot', 'Libby', 'Caitlin']

  // Utility functions
  const rng = (seed) => {
    if (seed == null || seed === "") return Math.random
    let t = Number(seed) >>> 0
    return function() {
      t += 0x6D2B79F5
      let r = Math.imul(t ^ t >>> 15, 1 | t)
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r)
      return ((r ^ r >>> 14) >>> 0) / 4294967296
    }
  }

  const generateSeed = () => {
    return Math.floor(Math.random() * 2147483647) // Max 32-bit integer
  }

  const createCostFunction = (targetGap, mode, rand) => {
    return (d) => {
      const x = d - targetGap
      
      if (mode === 'chaos') {
        // In chaos mode, all gaps have the same cost (0)
        // Any matchup where high > low is equally valid
        return 0
      } else if (mode === 'loose') {
        // In loose mode, gaps N-1, N, N+1 all have the same cost (0)
        if (Math.abs(x) <= 1) return 0
        // Outside tolerance zone, use quadratic penalty
        const baseCost = x * x
        const perturbation = (rand() - 0.5) * 0.1 * baseCost
        return baseCost + perturbation
      } else {
        // In strict mode, only exact target gap has cost 0
        const baseCost = x * x
        const perturbation = (rand() - 0.5) * 0.1 * baseCost
        return baseCost + perturbation
      }
    }
  }

  const shuffle = (arr, rand = Math.random) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

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
      const ranks = {}
      categories.forEach(() => {
        ranks[`rank_${Math.random()}`] = ''
      })
      newPlayerGrid.push({ name: playerName, ranks })
    }
    
    setPlayerGrid(newPlayerGrid)
    
    // Update target gap if not user-touched
    const suggested = Math.max(1, Math.ceil(categories.length/2))
    setTargetGap(suggested)
  }

  const buildChallenges = (cats) => {
    const arr = []
    for (const c of cats) {
      for (let i = 0; i < c.count; i++) {
        arr.push({ id: `${c.name}-${i+1}`, category: c.name })
      }
    }
    return arr
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

  // Core matchmaking algorithm functions
  const isBitSet = (mask, i) => ((mask >>> i) & 1) === 1
  const setBit = (mask, i) => mask | (1 << i)
  const popcount32 = (x) => {
    x = x - ((x >>> 1) & 0x55555555)
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24
  }

  const solveMatchmaking = (players, categories, challenges, { targetGap, timeLimitMs = 5000, costFn, selectN, coverPenaltyPerMissing = 0, requireCoverAll = false, randomSeed = null, countSolutions = false } = {}) => {
    const N = players.length
    const M = categories.length
    const C = challenges.length
    const need = selectN ?? N

    if (C < need) return { ok: false, reason: `Need at least ${need} challenges; got ${C}.` }

    // Validate ranks
    for (const p of players) {
      if (!p.ranks) return { ok: false, reason: `Missing ranks for player ${p.name}` }
      for (const c of categories) if (typeof p.ranks[c] !== 'number') return { ok: false, reason: `Missing numeric rank for ${p.name} in ${c}` }
    }

    const _target = Number.isFinite(targetGap) ? targetGap : Math.max(1, Math.ceil(M/2))
    const rand = rng(randomSeed)
    
    const _cost = typeof costFn === 'function' ? costFn : (d) => { 
      const x = d - _target
      const baseCost = x*x
      const perturbation = (rand() - 0.5) * 0.1 * baseCost
      return baseCost + perturbation
    }
    
    const t0 = performance.now()

    const catIndex = new Map(categories.map((c,i)=>[c,i]))

    const chans = challenges.map((ch, idx) => {
      const pairs = []
      for (let i=0;i<N;i++) for (let j=0;j<N;j++) if (i!==j) {
        const rHi = players[i].ranks[ch.category]
        const rLo = players[j].ranks[ch.category]
        if (rHi < rLo) { 
          const gap = Math.abs(rHi-rLo)
          pairs.push({hiIdx:i, loIdx:j, gap, cost:_cost(gap)})
        }
      }
      pairs.sort((a,b)=> {
        const costDiff = a.cost - b.cost
        if (Math.abs(costDiff) < 0.001) {
          return (rand() - 0.5) * 0.1
        }
        return costDiff || a.hiIdx - b.hiIdx || a.loIdx - b.loIdx
      })
      return { id: ch.id, category: ch.category, catBit: (1 << (catIndex.get(ch.category) ?? 0)), pairs, idx }
    })

    const zeroes = chans.filter(ch=>ch.pairs.length===0).length
    if (C - zeroes < need) return { ok: false, reason: 'Too many challenges have no valid pairs.' }

    const order = [...chans].map((ch,i)=>({i,len:ch.pairs.length})).sort((a,b)=>{
      const lenDiff = a.len - b.len
      if (lenDiff === 0) {
        return (rand() - 0.5) * 0.1
      }
      return lenDiff
    }).map(o=>o.i)

    const memo = new Map()
    const FULL = (1<<N) - 1
    const key = (k, hi, lo, sel, pairMaskStr, coverMask) => `${k}|${hi}|${lo}|${sel}|${pairMaskStr}|${coverMask}`

    function pairBit(i, j) {
      if (i > j) [i, j] = [j, i]
      const idx = i * N + j
      return 1n << BigInt(idx)
    }

    function dfs(k, usedHi, usedLo, selected, pairMask, coverMask) {
      if (performance.now() - t0 > timeLimitMs) return { best: Infinity, timedOut: true }
      const remaining = C - k
      const needMore = need - selected
      if (needMore === 0) {
        if (!(usedHi === FULL && usedLo === FULL)) return { best: Infinity }
        const coveredCount = popcount32(coverMask)
        const missing = M - coveredCount
        if (requireCoverAll && missing > 0) return { best: Infinity }
        const penalty = coverPenaltyPerMissing * missing
        return { best: penalty, picks: [], solutionCount: 1 }
      }
      if (remaining < needMore) return { best: Infinity }

      const memoKey = key(k, usedHi, usedLo, selected, pairMask.toString(), coverMask)
      if (memo.has(memoKey)) return memo.get(memoKey)

      let best = { best: Infinity, solutionCount: 0 }
      const ch = chans[order[k]]

      for (const pr of ch.pairs) {
        if (((usedHi >>> pr.hiIdx) & 1) === 1) continue
        if (((usedLo >>> pr.loIdx) & 1) === 1) continue
        const bit = pairBit(pr.hiIdx, pr.loIdx)
        if ((pairMask & bit) !== 0n) continue
        const sub = dfs(k+1, setBit(usedHi, pr.hiIdx), setBit(usedLo, pr.loIdx), selected+1, pairMask | bit, coverMask | ch.catBit)
        const total = sub.best === Infinity ? Infinity : pr.cost + sub.best
        if (total < best.best) {
          best = { 
            best: total, 
            picks: sub.picks ? [{use:true, chIndex: ch.idx, pr}].concat(sub.picks) : [{use:true, chIndex: ch.idx, pr}],
            solutionCount: countSolutions ? (sub.solutionCount || 0) : 0
          }
        } else if (countSolutions && total === best.best && Number.isFinite(total)) {
          best.solutionCount += (sub.solutionCount || 0)
        }
      }

      if (remaining - 1 >= needMore) {
        const subSkip = dfs(k+1, usedHi, usedLo, selected, pairMask, coverMask)
        if (subSkip.best < best.best) {
          best = { 
            best: subSkip.best, 
            picks: subSkip.picks ? [{use:false, chIndex: ch.idx}].concat(subSkip.picks) : [{use:false, chIndex: ch.idx}],
            solutionCount: countSolutions ? (subSkip.solutionCount || 0) : 0
          }
        } else if (countSolutions && subSkip.best === best.best && Number.isFinite(subSkip.best)) {
          best.solutionCount += (subSkip.solutionCount || 0)
        }
      }

      memo.set(memoKey, best)
      return best
    }

    const ans = dfs(0, 0, 0, 0, 0n, 0)
    if (!Number.isFinite(ans.best)) return { ok: false, reason: ans.timedOut ? 'Search time limit reached' : 'No feasible assignment found' }

    const useMap = new Map()
    for (const step of ans.picks || []) if (step.use) useMap.set(step.chIndex, step.pr)

    const assignments = []
    for (let i=0;i<C;i++) {
      if (!useMap.has(i)) continue
      const ch = challenges[i]
      const pr = useMap.get(i)
      const highPlayer = players[pr.hiIdx]
      const lowPlayer = players[pr.loIdx]
      const highRank = highPlayer.ranks[ch.category]
      const lowRank = lowPlayer.ranks[ch.category]
      assignments.push({
        challengeId: ch.id,
        category: ch.category,
        high: highPlayer.name,
        low: lowPlayer.name,
        highRank: highRank,
        lowRank: lowRank,
        gap: pr.gap,
        cost: _cost(pr.gap)
      })
    }

    return { ok: true, assignments, totalCost: assignments.reduce((s,a)=>s+a.cost,0), selectedCount: assignments.length, considered: C, solutionCount: ans.solutionCount || 0 }
  }

  const checkFeasible = (players, categories, challenges, { timeLimitMs = 2000, selectN, requireCoverAll = false } = {}) => {
    const res = solveMatchmaking(players, categories, challenges, { targetGap: 1, timeLimitMs, costFn: () => 0, selectN, coverPenaltyPerMissing: 0, requireCoverAll })
    return res.ok
  }

  const optimizeMatchOrdering = (assignments, seedValue = null) => {
    if (assignments.length <= 1) return assignments
    
    const ordered = []
    const remaining = [...assignments]
    
    // Use seeded random number generator for consistent ordering
    const rand = seedValue ? rng(seedValue) : Math.random
    const startIdx = Math.floor(rand() * remaining.length)
    ordered.push(remaining.splice(startIdx, 1)[0])
    
    while (remaining.length > 0) {
      let bestMatch = null
      let bestScore = -Infinity
      let bestIdx = -1
      
      for (let i = 0; i < remaining.length; i++) {
        const match = remaining[i]
        const lastMatch = ordered[ordered.length - 1]
        
        let score = 0
        
        if (match.category !== lastMatch.category) {
          score += 10
        }
        
        if (match.high !== lastMatch.high && match.high !== lastMatch.low &&
            match.low !== lastMatch.high && match.low !== lastMatch.low) {
          score += 20
        }
        
        score += rand() * 2
        
        if (score > bestScore) {
          bestScore = score
          bestMatch = match
          bestIdx = i
        }
      }
      
      ordered.push(remaining.splice(bestIdx, 1)[0])
    }
    
    return ordered
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
    setCancelSimFlag(false)
    setSimStatus('Running…')
    setSimResult('')

    let infeasible = 0
    for (let t=0; t<trials; t++) {
      if (cancelSimFlag) break
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
    setCancelSimFlag(false)
    const ran = cancelSimFlag ? ' (cancelled early)' : ''
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
    setSolveOutput('')
    if (!parsed.ok) { 
      setSolveOutput(`<div class="validation-message">Error: ${parsed.reason}</div>`)
      return 
    }
    
    if (parsed.challenges.length < numPlayers) {
      setSolveOutput(`<div class="validation-message">Not enough challenges! You have ${parsed.challenges.length} challenges but need at least ${numPlayers} for ${numPlayers} players.</div>`)
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
      setSolveOutput('No feasible assignment found.')
      return
    }
    
    const targetGapValue = targetGap || Math.ceil(parsed.categories.length/2)
    setSolveStatus('Solving…')
    
    // Create cost function based on gap mode
    const rand = rng(newSeed)
    const costFn = createCostFunction(targetGapValue, gapMode, rand)
    
    const res = solveMatchmaking(parsed.players, parsed.categories, parsed.challenges, { 
      targetGap: targetGapValue, 
      timeLimitMs: Infinity,
      costFn: costFn,
      selectN: numPlayers, 
      coverPenaltyPerMissing: 10,
      requireCoverAll: false,
      randomSeed: newSeed,
      countSolutions: true
    })
    setSolveStatus('')
    if (!res.ok) { 
      setSolveOutput(`<div class="validation-message">Error: ${res.reason}</div>`)
      return 
    }

    const optimizedAssignments = optimizeMatchOrdering(res.assignments, newSeed)
    
    // Store assignments for efficient saving
    setCurrentAssignments(optimizedAssignments)
    
    const tableRows = optimizedAssignments.map((a, index) => 
      `<tr><td>${index + 1}</td><td>${a.category}</td><td><strong>${a.high}</strong></td><td>${a.low}</td><td>${a.highRank} vs ${a.lowRank}</td></tr>`
    ).join('')
    
    // Add solution count info if there are few solutions
    let solutionCountInfo = ''
    if (res.solutionCount && res.solutionCount <= 100) {
      const countText = res.solutionCount === 1 ? '1 unique solution' : `${res.solutionCount} unique solutions`
      solutionCountInfo = `<div class="solution-count-info">Found ${countText} with optimal cost</div>`
    }
    
    setSolveOutput(`
      ${solutionCountInfo}
      <table>
        <thead><tr><th>#</th><th>Category</th><th>Favorite</th><th>Underdog</th><th>Matchup</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    `)
  }

  const generateShareUrl = () => {
    try {
      // If we have matchups already generated, use the more efficient ?save approach
      if (solveOutput) {
        return generateMatchupsUrl()
      }
      
      // Otherwise, fall back to the original ?data approach
      const parsed = readPlayersFromGrid()
      
      if (!categories.length) {
        alert('Please add at least one category before sharing.')
        return
      }
      
      if (!parsed.ok) {
        alert(`Cannot share: ${parsed.reason}`)
        return
      }
      
      const categoriesStr = categories.map(c => c.name).join(',')
      const challengeCounts = categories.map(c => c.count).join(',')
      const playerNames = parsed.players.map(p => p.name).join(',')
      
      const rankSections = parsed.players.map(player => {
        return categories.map(cat => player.ranks[cat.name]).join(',')
      })
      
      const dataString = [categoriesStr, challengeCounts, playerNames, ...rankSections].join('|')
      const encodedData = btoa(dataString)
      const baseUrl = window.location.origin + window.location.pathname
      const shareUrl = `${baseUrl}?data=${encodedData}`
      
      console.log('Generated share URL:', shareUrl)
      
      navigator.clipboard.writeText(shareUrl).then(() => {
        setShareStatus('URL copied to clipboard!')
        setTimeout(() => setShareStatus(''), 3000)
        // Redirect to the saved URL after copying
        window.location.href = shareUrl
      }).catch(() => {
        prompt('Share this URL:', shareUrl)
        setShareStatus('URL generated!')
        setTimeout(() => setShareStatus(''), 3000)
        // Still redirect even if clipboard copy failed
        window.location.href = shareUrl
      })
      
    } catch (error) {
      console.error('Error generating share URL:', error)
      setShareStatus('Error generating URL')
      setTimeout(() => setShareStatus(''), 3000)
    }
  }

  const generateMatchupsUrl = () => {
    try {
      if (!currentAssignments || currentAssignments.length === 0) {
        alert('No matchups to save. Please generate matches first.')
        return
      }
      
      // Create minimal matchup data (only what's displayed)
      const matchups = currentAssignments.map((assignment, index) => ({
        number: index + 1,
        category: assignment.category,
        high: assignment.high,
        low: assignment.low,
        matchup: `${assignment.highRank} vs ${assignment.lowRank}`
      }))
      
      // Encode matchups data
      const matchupsString = JSON.stringify(matchups)
      const encodedMatchups = btoa(matchupsString)
      
      const baseUrl = window.location.origin + window.location.pathname
      const shareUrl = `${baseUrl}?save=${encodedMatchups}`
      
      console.log('Generated matchups URL:', shareUrl)
      
      navigator.clipboard.writeText(shareUrl).then(() => {
        setShareStatus('Matchups URL copied to clipboard!')
        setTimeout(() => setShareStatus(''), 3000)
        // Redirect to the saved URL after copying
        window.location.href = shareUrl
      }).catch(() => {
        prompt('Share this URL:', shareUrl)
        setShareStatus('Matchups URL generated!')
        setTimeout(() => setShareStatus(''), 3000)
        // Still redirect even if clipboard copy failed
        window.location.href = shareUrl
      })
      
    } catch (error) {
      console.error('Error generating matchups URL:', error)
      setShareStatus('Error generating matchups URL')
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
    
    // Handle ?save parameter (pre-generated matchups)
    if (saveParam) {
      try {
        const decodedMatchups = atob(saveParam)
        const matchups = JSON.parse(decodedMatchups)
        
        // Generate HTML table from matchups data
        const tableRows = matchups.map((matchup, index) => 
          `<tr><td>${matchup.number}</td><td>${matchup.category}</td><td><strong>${matchup.high}</strong></td><td>${matchup.low}</td><td>${matchup.matchup}</td></tr>`
        ).join('')
        
        const matchupsHtml = `
          <table>
            <thead><tr><th>#</th><th>Category</th><th>Favorite</th><th>Underdog</th><th>Matchup</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        `
        
        setSolveOutput(matchupsHtml)
        setIsViewOnlyMode(true) // Enable view-only mode to hide other panels
        setIsUrlLoaded(true)
        
        console.log('Successfully loaded matchups from ?save parameter')
        return
        
      } catch (error) {
        console.error('Error parsing ?save parameter:', error.message)
        alert(`Error loading saved matchups: ${error.message}\n\nUsing default configuration instead.`)
      }
    }
    
    // Note: ?seed parameter is no longer needed since ?save encodes actual matchups
    
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
      
      console.log('Successfully loaded data from URL parameter')
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
  const challengeStatus = totalChallenges < numPlayers ? '❗ fewer than N (add more)' : 
                         (totalChallenges === numPlayers ? '✓ equals N' : 
                         `✓ will choose best N of ${totalChallenges}`)

  return (
    <div className="matchmaker">
      <div className="matchmaker-content">
        <div className="matchmaker-header">
          <h1>Underdogs Matchmaker</h1>
        </div>

        {/* Game Setup Section */}
        {!isViewOnlyMode && (
        <div className="game-setup-section">
          <div className="setup-panel">
            <h3>Game Setup</h3>
            
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
        <div className="simulation-section">
          <div className="simulation-panel">
            <h3>Simulation</h3>
            
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
                <button className="btn btn-primary" onClick={runSimulation}>
                  Run Simulation
                </button>
                <button 
                  className="btn btn-secondary"
                  disabled={!cancelSimFlag}
                  onClick={() => setCancelSimFlag(true)}
                >
                  Cancel
                </button>
              </div>
              
              {simStatus && <div className="status-message">{simStatus}</div>}
            </div>
            
            {simResult && (
              <div className="simulation-result" dangerouslySetInnerHTML={{ __html: simResult }}></div>
            )}
          </div>
        </div>
        )}

        {/* Player Rankings Section */}
        {!isViewOnlyMode && (
        <div className="player-rankings-section">
          <h3>Player Rankings</h3>
          
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
                            updated[index].name = e.target.value
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
                              updated[index].ranks[cat.name] = parseInt(e.target.value) || ''
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
            {solveStatus && <div className="status-message">{solveStatus}</div>}
          </div>
        </div>
        )}

        {/* Match Ups Section */}
        {solveOutput && (
          <div className="matchups-section">
            <div className="matchups-panel">
              <h3>Matchups</h3>
              <div className="matchmaking-results" dangerouslySetInnerHTML={{ __html: solveOutput }}></div>
              {!isViewOnlyMode && (
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
