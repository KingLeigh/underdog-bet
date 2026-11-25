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

  // Memo of subproblem results. The search returns the cost of the best
  // completion from a state, which depends only on the state (not on the
  // path that reached it), so states reached by different paths share one
  // entry.
  const memo = new Map()
  const FULL = (1<<N) - 1
  const NONE = { best: Infinity }

  function pairBit(i, j) {
    if (i > j) [i, j] = [j, i]
    const idx = i * N + j
    return 1n << BigInt(idx)
  }

  // Search-wide outcomes. Once the time limit passes or a zero-cost
  // schedule turns up, the search unwinds and the answer is the best
  // complete schedule recorded (with its actual picks).
  let timedOut = false
  let foundPerfectSolution = false
  let bestSolutionSoFar = { best: Infinity, picks: null }
  // Current decision path, for recording complete schedules
  const path = []

  function record(total, picks) {
    if (total < bestSolutionSoFar.best) bestSolutionSoFar = { best: total, picks }
    if (total === 0) foundPerfectSolution = true
  }

  // k: next challenge (in search order); usedHi/usedLo: players already
  // placed as favorite/underdog; pairMask: pairs already matched;
  // coverMask: categories used; catMasks[p]: categories player p has
  // played (bitmask; nobody plays a category twice); pathCost: gap cost of
  // the picks so far (only for recording complete schedules).
  // Returns { best, picks } for the remaining decisions.
  function dfs(k, usedHi, usedLo, selected, pairMask, coverMask, catMasks, pathCost) {
    if (foundPerfectSolution || timedOut) return NONE
    if (performance.now() - t0 > timeLimitMs) {
      timedOut = true
      return NONE
    }

    const remaining = C - k
    const needMore = need - selected

    if (needMore === 0) {
      if (!(usedHi === FULL && usedLo === FULL)) return NONE
      const missing = M - popcount32(coverMask)
      if (requireCoverAll && missing > 0) return NONE
      const coverPenalty = coverPenaltyPerMissing * missing
      record(pathCost + coverPenalty, path.slice())
      return { best: coverPenalty, picks: [] }
    }

    if (remaining < needMore) return NONE

    const memoKey = `${k}|${usedHi}|${usedLo}|${selected}|${pairMask}|${coverMask}|${catMasks.join(',')}`
    const hit = memo.get(memoKey)
    if (hit) {
      // Reached by a new path: the completion is known, so record the
      // whole schedule it makes from here
      if (hit.best !== Infinity) record(pathCost + hit.best, path.concat(hit.picks))
      return hit
    }

    let best = NONE
    const ch = chans[order[k]]

    for (const pr of ch.pairs) {
      if (((usedHi >>> pr.hiIdx) & 1) === 1) continue
      if (((usedLo >>> pr.loIdx) & 1) === 1) continue
      const bit = pairBit(pr.hiIdx, pr.loIdx)
      if ((pairMask & bit) !== 0n) continue

      // Hard constraint: no player can play the same category more than once
      if (((catMasks[pr.hiIdx] | catMasks[pr.loIdx]) & ch.catBit) !== 0) continue
      const nextCatMasks = catMasks.slice()
      nextCatMasks[pr.hiIdx] |= ch.catBit
      nextCatMasks[pr.loIdx] |= ch.catBit

      const step = { use: true, chIndex: ch.idx, pr }
      path.push(step)
      const sub = dfs(k+1, setBit(usedHi, pr.hiIdx), setBit(usedLo, pr.loIdx), selected+1, pairMask | bit, coverMask | ch.catBit, nextCatMasks, pathCost + pr.cost)
      path.pop()
      if (foundPerfectSolution || timedOut) return NONE

      const total = sub.best + pr.cost
      if (total < best.best) best = { best: total, picks: [step, ...sub.picks] }
    }

    if (remaining - 1 >= needMore) {
      const step = { use: false, chIndex: ch.idx }
      path.push(step)
      const sub = dfs(k+1, usedHi, usedLo, selected, pairMask, coverMask, catMasks, pathCost)
      path.pop()
      if (foundPerfectSolution || timedOut) return NONE

      if (sub.best < best.best) best = { best: sub.best, picks: [step, ...sub.picks] }
    }

    memo.set(memoKey, best)
    return best
  }

  let ans = dfs(0, 0, 0, 0, 0n, 0, new Array(N).fill(0), 0)

  // An interrupted search (time limit, or stopped at a perfect schedule)
  // answers with the best complete schedule it recorded
  if (timedOut || foundPerfectSolution) {
    if (bestSolutionSoFar.best === Infinity) {
      return { ok: false, reason: 'Search time limit reached - no solution found' }
    }
    ans = bestSolutionSoFar
  } else if (!Number.isFinite(ans.best)) {
    return { ok: false, reason: 'No feasible assignment found' }
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

// Order matchups into a play order for the evening. Whole orderings are
// scored globally (party-sized schedules make this cheap):
//   1. rest  - maximize the minimum number of matchups between any player's
//              two appearances (no back-to-back contests, dominant term)
//   2. flow  - penalize consecutive matchups in the same category
//   3. finale - bonus when a maximum-gap matchup closes the show
// Seeded random sampling plus swap hill-climbing; deterministic per seed.
export function optimizeMatchOrdering(assignments, seedValue = null) {
  const n = assignments.length
  if (n <= 2) return assignments

  const rand = seedValue ? rng(seedValue) : Math.random
  const biggestGap = Math.max(...assignments.map(a => a.gap || 0))

  const scoreOrder = (order) => {
    const slots = new Map() // player -> appearance indexes
    order.forEach((m, i) => {
      for (const p of [m.high, m.low]) {
        if (!slots.has(p)) slots.set(p, [])
        slots.get(p).push(i)
      }
    })

    let minRest = Infinity
    let sumRest = 0
    for (const appearances of slots.values()) {
      for (let k = 1; k < appearances.length; k++) {
        const rest = appearances[k] - appearances[k - 1] - 1
        minRest = Math.min(minRest, rest)
        sumRest += rest
      }
    }
    if (minRest === Infinity) minRest = n // nobody appears twice

    let sameCategoryAdjacent = 0
    for (let i = 1; i < n; i++) {
      if (order[i].category === order[i - 1].category) sameCategoryAdjacent++
    }

    const finale = (order[n - 1].gap || 0) === biggestGap ? 1 : 0

    return 2000 * minRest + 5 * sumRest - 100 * sameCategoryAdjacent + 150 * finale
  }

  // Sample random orderings, keep the best…
  let best = null
  let bestScore = -Infinity
  const tries = Math.min(400, 60 * n)
  for (let t = 0; t < tries; t++) {
    const candidate = shuffle([...assignments], rand)
    const s = scoreOrder(candidate)
    if (s > bestScore) {
      bestScore = s
      best = candidate
    }
  }

  // …then improve it with pairwise-swap hill climbing
  let improved = true
  let guard = 0
  while (improved && guard++ < 50) {
    improved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        ;[best[i], best[j]] = [best[j], best[i]]
        const s = scoreOrder(best)
        if (s > bestScore) {
          bestScore = s
          improved = true
        } else {
          ;[best[i], best[j]] = [best[j], best[i]]
        }
      }
    }
  }

  return best
}
