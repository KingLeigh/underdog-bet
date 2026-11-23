/**
 * Matchmaker solver: pure functions, no React.
 *
 * Given players with per-category self-ranks and a pool of challenges,
 * finds an assignment of matchups (favorite vs underdog per challenge)
 * where every player appears exactly once as favorite and once as underdog,
 * never plays the same category twice, and rank gaps are as close to the
 * target as the chosen cost function demands.
 */

// Seeded RNG (mulberry32); no seed → Math.random
export function rng(seed) {
  if (seed == null || seed === "") return Math.random
  let t = Number(seed) >>> 0
  return function() {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ t >>> 15, 1 | t)
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r)
    return ((r ^ r >>> 14) >>> 0) / 4294967296
  }
}

export function generateSeed() {
  return Math.floor(Math.random() * 2147483647) // Max 32-bit integer
}

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Gap-cost function for the given mode:
// 'chaos' - any gap is fine; 'loose' - target ±1 is free; 'strict' - only the exact target is free
export function createCostFunction(targetGap, mode, rand) {
  return (d) => {
    const x = d - targetGap

    if (mode === 'chaos') {
      return 0
    } else if (mode === 'loose') {
      if (Math.abs(x) <= 1) return 0
      const baseCost = x * x
      const perturbation = (rand() - 0.5) * 0.1 * baseCost
      return baseCost + perturbation
    } else {
      const baseCost = x * x
      const perturbation = (rand() - 0.5) * 0.1 * baseCost
      return baseCost + perturbation
    }
  }
}

// Expand [{ name, count }] categories into individual challenges
export function buildChallenges(cats) {
  const arr = []
  for (const c of cats) {
    for (let i = 0; i < c.count; i++) {
      arr.push({ id: `${c.name}-${i+1}`, category: c.name })
    }
  }
  return arr
}

const setBit = (mask, i) => mask | (1 << i)

const popcount32 = (x) => {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24
}

export function solveMatchmaking(players, categories, challenges, { targetGap, timeLimitMs = 5000, costFn, selectN, coverPenaltyPerMissing = 0, requireCoverAll = false, randomSeed = null } = {}) {
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

  // Order challenges by number of pairs (fewest first)
  const order = [...chans].map((ch,i)=>({i,len:ch.pairs.length})).sort((a,b)=>{
    const lenDiff = a.len - b.len
    if (lenDiff === 0) {
      return (rand() - 0.5) * 0.1
    }
    return lenDiff
  }).map(o=>o.i)

  const memo = new Map()
  const FULL = (1<<N) - 1
  const key = (k, hi, lo, sel, pairMaskStr, coverMask, playerCategoryMaskStr, totalGapCost) => `${k}|${hi}|${lo}|${sel}|${pairMaskStr}|${coverMask}|${playerCategoryMaskStr}|${totalGapCost}`

  function pairBit(i, j) {
    if (i > j) [i, j] = [j, i]
    const idx = i * N + j
    return 1n << BigInt(idx)
  }

  // Player-category tracking: player index -> list of category indexes played
  function createPlayerCategoryMask() {
    return new Map()
  }

  function clonePlayerCategoryMask(mask) {
    const newMask = new Map()
    for (const [player, cats] of mask) {
      newMask.set(player, [...cats])
    }
    return newMask
  }

  function serializePlayerCategoryMask(mask) {
    const entries = []
    for (const [player, cats] of mask) {
      const sortedCategories = [...cats].sort()
      entries.push(`${player}:${sortedCategories.join(',')}`)
    }
    return entries.sort().join('|')
  }

  // Hard constraint: no player can play the same category more than once
  function wouldCreateSameCategoryConflict(pr, currentPlayerCategoryMask, categoryIndex) {
    if (currentPlayerCategoryMask.has(pr.hiIdx) &&
        currentPlayerCategoryMask.get(pr.hiIdx).includes(categoryIndex)) {
      return true
    }

    if (currentPlayerCategoryMask.has(pr.loIdx) &&
        currentPlayerCategoryMask.get(pr.loIdx).includes(categoryIndex)) {
      return true
    }

    return false
  }

  let foundPerfectSolution = false
  let bestSolutionSoFar = { best: Infinity, picks: null }
  // Current decision path, so the best-so-far fallback (used on timeout)
  // can record the actual schedule, not just its score
  const path = []

  function dfs(k, usedHi, usedLo, selected, pairMask, coverMask, playerCategoryMask, totalGapCost = 0) {
    // Early termination: if we already found a perfect solution, stop searching
    if (foundPerfectSolution) {
      return { best: Infinity, earlyTerminated: true }
    }

    if (performance.now() - t0 > timeLimitMs) {
      return { best: bestSolutionSoFar.best, picks: bestSolutionSoFar.picks, timedOut: true }
    }

    const remaining = C - k
    const needMore = need - selected

    if (needMore === 0) {
      if (!(usedHi === FULL && usedLo === FULL)) return { best: Infinity }
      const coveredCount = popcount32(coverMask)
      const missing = M - coveredCount
      if (requireCoverAll && missing > 0) return { best: Infinity }
      const coverPenalty = coverPenaltyPerMissing * missing
      const totalPenalty = totalGapCost + coverPenalty

      // Track the best solution found so far (with its actual picks)
      if (totalPenalty < bestSolutionSoFar.best) {
        bestSolutionSoFar = { best: totalPenalty, picks: path.slice() }
      }

      // Early termination: if we found a perfect solution (cost=0), return immediately
      if (totalPenalty === 0) {
        foundPerfectSolution = true
        return { best: totalPenalty, picks: [], perfectSolution: true }
      }

      return { best: totalPenalty, picks: [] }
    }

    if (remaining < needMore) return { best: Infinity }

    const memoKey = key(k, usedHi, usedLo, selected, pairMask.toString(), coverMask, serializePlayerCategoryMask(playerCategoryMask), totalGapCost)
    if (memo.has(memoKey)) {
      return memo.get(memoKey)
    }

    let best = { best: Infinity }
    const ch = chans[order[k]]

    for (const pr of ch.pairs) {
      if (((usedHi >>> pr.hiIdx) & 1) === 1) continue
      if (((usedLo >>> pr.loIdx) & 1) === 1) continue
      const bit = pairBit(pr.hiIdx, pr.loIdx)
      if ((pairMask & bit) !== 0n) continue

      // Hard constraint: no player can play the same category more than once
      const categoryIndex = catIndex.get(ch.category)
      if (wouldCreateSameCategoryConflict(pr, playerCategoryMask, categoryIndex)) {
        continue  // Skip this pair entirely
      }

      // Update player-category mask for this assignment
      const newPlayerCategoryMask = clonePlayerCategoryMask(playerCategoryMask)

      if (!newPlayerCategoryMask.has(pr.hiIdx)) {
        newPlayerCategoryMask.set(pr.hiIdx, [])
      }
      newPlayerCategoryMask.get(pr.hiIdx).push(categoryIndex)

      if (!newPlayerCategoryMask.has(pr.loIdx)) {
        newPlayerCategoryMask.set(pr.loIdx, [])
      }
      newPlayerCategoryMask.get(pr.loIdx).push(categoryIndex)

      path.push({ use: true, chIndex: ch.idx, pr })
      const sub = dfs(k+1, setBit(usedHi, pr.hiIdx), setBit(usedLo, pr.loIdx), selected+1, pairMask | bit, coverMask | ch.catBit, newPlayerCategoryMask, totalGapCost + pr.cost)
      path.pop()
      const total = sub.best === Infinity ? Infinity : sub.best

      // Early termination: if we found a perfect solution, return immediately
      if (sub.perfectSolution && total === 0) {
        foundPerfectSolution = true
        return {
          best: total,
          picks: sub.picks ? [{use:true, chIndex: ch.idx, pr}].concat(sub.picks) : [{use:true, chIndex: ch.idx, pr}],
          perfectSolution: true
        }
      }

      if (total < best.best) {
        best = {
          best: total,
          picks: sub.picks ? [{use:true, chIndex: ch.idx, pr}].concat(sub.picks) : [{use:true, chIndex: ch.idx, pr}]
        }
      }
    }

    if (remaining - 1 >= needMore) {
      path.push({ use: false, chIndex: ch.idx })
      const subSkip = dfs(k+1, usedHi, usedLo, selected, pairMask, coverMask, playerCategoryMask, totalGapCost)
      path.pop()

      // Early termination: if we found a perfect solution in skip path, return immediately
      if (subSkip.perfectSolution && subSkip.best === 0) {
        foundPerfectSolution = true
        return {
          best: subSkip.best,
          picks: subSkip.picks ? [{use:false, chIndex: ch.idx}].concat(subSkip.picks) : [{use:false, chIndex: ch.idx}],
          perfectSolution: true
        }
      }

      if (subSkip.best < best.best) {
        best = {
          best: subSkip.best,
          picks: subSkip.picks ? [{use:false, chIndex: ch.idx}].concat(subSkip.picks) : [{use:false, chIndex: ch.idx}]
        }
      }
    }

    memo.set(memoKey, best)
    return best
  }

  const ans = dfs(0, 0, 0, 0, 0n, 0, createPlayerCategoryMask(), 0)

  if (!Number.isFinite(ans.best)) {
    if (ans.timedOut) {
      if (bestSolutionSoFar.best === Infinity) {
        return { ok: false, reason: 'Search time limit reached - no solution found' }
      } else {
        // Use the best solution found so far
        ans.best = bestSolutionSoFar.best
        ans.picks = bestSolutionSoFar.picks
        ans.timedOut = true
      }
    } else {
      return { ok: false, reason: 'No feasible assignment found' }
    }
  }

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

  const gapCost = assignments.reduce((s,a)=>s+a.cost,0)

  return {
    ok: true,
    assignments,
    totalCost: ans.best,
    gapCost,
    selectedCount: assignments.length,
    considered: C
  }
}

export function checkFeasible(players, categories, challenges, { timeLimitMs = 2000, selectN, requireCoverAll = false } = {}) {
  const res = solveMatchmaking(players, categories, challenges, { targetGap: 1, timeLimitMs, costFn: () => 0, selectN, coverPenaltyPerMissing: 0, requireCoverAll })
  return res.ok
}

// Order matchups so consecutive matches avoid repeating a category or player
export function optimizeMatchOrdering(assignments, seedValue = null) {
  if (assignments.length <= 1) return assignments

  const ordered = []
  const remaining = [...assignments]

  const rand = seedValue ? rng(seedValue) : Math.random
  const startIdx = Math.floor(rand() * remaining.length)
  ordered.push(remaining.splice(startIdx, 1)[0])

  while (remaining.length > 0) {
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
        bestIdx = i
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0])
  }

  return ordered
}
