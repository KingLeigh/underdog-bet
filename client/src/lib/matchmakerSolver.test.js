// Invariant tests for the matchmaker solver.
//
// These assert the *properties* a valid matchup assignment must have, not any
// particular output, so they survive changes to cost functions, ordering
// heuristics, and performance work — and only fail when the solver is
// genuinely wrong.

import { describe, test, expect } from 'vitest'
import {
  rng,
  shuffle,
  createCostFunction,
  buildChallenges,
  solveMatchmaking,
  checkFeasible,
  optimizeMatchOrdering,
  solveSchedule
} from './matchmakerSolver'

// A known-feasible setup: 2 categories, 8 players split 4/4 between
// rank 1 and rank 2 in each category (verified feasible by construction:
// every category needs its matchups to pair a rank-1 against a rank-2).
function feasibleSetup() {
  const categories = ['Trivia', 'Cardio']
  const challenges = buildChallenges([
    { name: 'Trivia', count: 4 },
    { name: 'Cardio', count: 4 }
  ])
  const players = []
  for (let i = 0; i < 8; i++) {
    const first = i < 4
    players.push({
      name: `P${i + 1}`,
      ranks: { Trivia: first ? 1 : 2, Cardio: first ? 2 : 1 }
    })
  }
  return { players, categories, challenges }
}

// The same shape but 6/2 instead of 4/4: four Trivia matchups are impossible
// with only two rank-2 Trivia players.
function infeasibleSetup() {
  const { categories, challenges } = feasibleSetup()
  const players = []
  for (let i = 0; i < 8; i++) {
    const first = i < 6
    players.push({
      name: `P${i + 1}`,
      ranks: { Trivia: first ? 1 : 2, Cardio: first ? 2 : 1 }
    })
  }
  return { players, categories, challenges }
}

function assertValidAssignment(res, players, categories, numPlayers) {
  expect(res.ok).toBe(true)
  const { assignments } = res

  // Exactly one matchup per player slot
  expect(assignments.length).toBe(numPlayers)

  // Every player appears exactly once as favorite and exactly once as underdog
  const highs = assignments.map(a => a.high)
  const lows = assignments.map(a => a.low)
  const names = players.map(p => p.name)
  expect(new Set(highs).size).toBe(numPlayers)
  expect(new Set(lows).size).toBe(numPlayers)
  for (const name of names) {
    expect(highs).toContain(name)
    expect(lows).toContain(name)
  }

  const rankOf = (name, category) => players.find(p => p.name === name).ranks[category]

  const playedCategories = new Map() // name -> Set of categories
  for (const a of assignments) {
    // The favorite genuinely outranks the underdog in that category
    expect(a.highRank).toBe(rankOf(a.high, a.category))
    expect(a.lowRank).toBe(rankOf(a.low, a.category))
    expect(a.highRank).toBeLessThan(a.lowRank)
    expect(a.gap).toBe(a.lowRank - a.highRank)
    expect(categories).toContain(a.category)

    // No player plays the same category twice
    for (const name of [a.high, a.low]) {
      if (!playedCategories.has(name)) playedCategories.set(name, new Set())
      expect(playedCategories.get(name).has(a.category)).toBe(false)
      playedCategories.get(name).add(a.category)
    }
  }
}

describe('solveMatchmaking', () => {
  test('produces a valid assignment for a feasible setup', () => {
    const { players, categories, challenges } = feasibleSetup()
    const res = solveMatchmaking(players, categories, challenges, {
      targetGap: 1,
      selectN: players.length,
      randomSeed: 42
    })
    assertValidAssignment(res, players, categories, players.length)
  })

  test('holds its invariants across many seeds', () => {
    const { players, categories, challenges } = feasibleSetup()
    for (const seed of [1, 7, 1234, 99999, 2147483646]) {
      const res = solveMatchmaking(players, categories, challenges, {
        targetGap: 1,
        selectN: players.length,
        randomSeed: seed
      })
      assertValidAssignment(res, players, categories, players.length)
    }
  })

  test('holds its invariants with more categories than matchups per player', () => {
    // 4 categories × 2 challenges = 8 challenges for 4 players: the solver
    // must pick the best 4 and still satisfy every invariant.
    const categories = ['A', 'B', 'C', 'D']
    const challenges = buildChallenges(categories.map(name => ({ name, count: 2 })))
    const rand = rng(7)
    const players = Array.from({ length: 4 }, (_, i) => {
      const perm = shuffle([1, 2, 3, 4], rand)
      const ranks = {}
      categories.forEach((c, j) => { ranks[c] = perm[j] })
      return { name: `P${i + 1}`, ranks }
    })

    const res = solveMatchmaking(players, categories, challenges, {
      selectN: players.length,
      randomSeed: 7
    })
    if (res.ok) {
      assertValidAssignment(res, players, categories, players.length)
    } else {
      // A random draw can be infeasible; that is a legitimate outcome,
      // but it must be reported, not crash.
      expect(res.reason).toBeTruthy()
    }
  })

  test('reports an impossible setup as infeasible', () => {
    const { players, categories, challenges } = infeasibleSetup()
    const res = solveMatchmaking(players, categories, challenges, {
      targetGap: 1,
      selectN: players.length,
      randomSeed: 42
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toBeTruthy()
  })

  test('rejects missing or non-numeric ranks with a reason', () => {
    const { players, categories, challenges } = feasibleSetup()
    const broken = players.map((p, i) => i === 0 ? { name: p.name, ranks: { Trivia: 1 } } : p)
    const res = solveMatchmaking(broken, categories, challenges, { selectN: players.length })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/rank/i)
  })

  test('refuses when there are fewer challenges than players', () => {
    const { players, categories } = feasibleSetup()
    const challenges = buildChallenges([{ name: 'Trivia', count: 3 }])
    const res = solveMatchmaking(players, categories, challenges, { selectN: players.length })
    expect(res.ok).toBe(false)
  })
})

describe('category coverage preference', () => {
  test('a schedule covers every category when possible, even with zero gap preference', () => {
    // 4 players, 3 categories x2 challenges: only 4 of 6 challenges get
    // used, so the solver could double up on two categories and skip one —
    // the coverage penalty must prevent that whenever full coverage exists.
    const categories = ['A', 'B', 'C']
    const challenges = buildChallenges(categories.map(name => ({ name, count: 2 })))
    const rand = rng(11)
    const players = Array.from({ length: 4 }, (_, i) => {
      const perm = shuffle([1, 2, 3], rand)
      const ranks = {}
      categories.forEach((c, j) => { ranks[c] = perm[j] })
      return { name: `P${i + 1}`, ranks }
    })

    for (const seed of [1, 42, 777, 31337]) {
      const res = solveMatchmaking(players, categories, challenges, {
        costFn: () => 0, // no gap preference, like the live matchmaker
        selectN: players.length,
        coverPenaltyPerMissing: 10,
        requireCoverAll: false,
        randomSeed: seed
      })
      if (!res.ok) continue // a draw can be infeasible; that's not this test
      const usedCategories = new Set(res.assignments.map(a => a.category))
      expect(usedCategories.size).toBe(categories.length)
    }
  })
})

describe('checkFeasible', () => {
  test('agrees with the solver on feasibility', () => {
    const feasible = feasibleSetup()
    expect(checkFeasible(feasible.players, feasible.categories, feasible.challenges, { selectN: 8 })).toBe(true)

    const infeasible = infeasibleSetup()
    expect(checkFeasible(infeasible.players, infeasible.categories, infeasible.challenges, { selectN: 8 })).toBe(false)
  })
})

describe('optimizeMatchOrdering', () => {
  test('returns a permutation of its input', () => {
    const { players, categories, challenges } = feasibleSetup()
    const res = solveMatchmaking(players, categories, challenges, {
      targetGap: 1,
      selectN: players.length,
      randomSeed: 42
    })
    const ordered = optimizeMatchOrdering(res.assignments, 7)
    expect(ordered.length).toBe(res.assignments.length)
    const key = a => `${a.category}|${a.high}|${a.low}`
    expect(ordered.map(key).sort()).toEqual(res.assignments.map(key).sort())
  })

  test('avoids back-to-back appearances when an ordering without them exists', () => {
    // M4 shares a player with M1 (A) and M2 (C), but M3 is fully disjoint,
    // so e.g. M1, M2, M3, M4 has no adjacent matchups sharing a player.
    const assignments = [
      { high: 'A', low: 'B', category: 'Trivia', gap: 1 },
      { high: 'C', low: 'D', category: 'Cardio', gap: 1 },
      { high: 'E', low: 'F', category: 'Darts', gap: 1 },
      { high: 'A', low: 'C', category: 'Memory', gap: 1 }
    ]
    for (const seed of [1, 7, 42, 999]) {
      const ordered = optimizeMatchOrdering(assignments, seed)
      for (let i = 1; i < ordered.length; i++) {
        const prev = [ordered[i - 1].high, ordered[i - 1].low]
        expect(prev).not.toContain(ordered[i].high)
        expect(prev).not.toContain(ordered[i].low)
      }
    }
  })

  test('puts a biggest-gap matchup last when the ordering is unconstrained', () => {
    // All players and categories distinct: rest and alternation put no
    // pressure on the order, so the finale bonus decides the closer.
    const assignments = [
      { high: 'A', low: 'B', category: 'Trivia', gap: 1 },
      { high: 'C', low: 'D', category: 'Cardio', gap: 5 },
      { high: 'E', low: 'F', category: 'Darts', gap: 2 },
      { high: 'G', low: 'H', category: 'Memory', gap: 3 }
    ]
    for (const seed of [1, 7, 42, 999]) {
      const ordered = optimizeMatchOrdering(assignments, seed)
      expect(ordered[ordered.length - 1].gap).toBe(5)
    }
  })

  test('is deterministic for a given seed', () => {
    const { players, categories, challenges } = feasibleSetup()
    const res = solveMatchmaking(players, categories, challenges, {
      targetGap: 1,
      selectN: players.length,
      randomSeed: 42
    })
    const key = a => `${a.category}|${a.high}|${a.low}`
    const a = optimizeMatchOrdering([...res.assignments], 1234)
    const b = optimizeMatchOrdering([...res.assignments], 1234)
    expect(a.map(key)).toEqual(b.map(key))
  })
})

describe('createCostFunction', () => {
  const flat = () => 0.5 // deterministic "random": zero perturbation

  test('chaos mode treats every gap equally', () => {
    const cost = createCostFunction(2, 'chaos', flat)
    for (const gap of [1, 2, 3, 7]) expect(cost(gap)).toBe(0)
  })

  test('loose mode is free within ±1 of the target and penalizes beyond', () => {
    const cost = createCostFunction(3, 'loose', flat)
    expect(cost(2)).toBe(0)
    expect(cost(3)).toBe(0)
    expect(cost(4)).toBe(0)
    expect(cost(1)).toBeGreaterThan(0)
    expect(cost(5)).toBeGreaterThan(0)
  })

  test('strict mode is free only at the exact target', () => {
    const cost = createCostFunction(3, 'strict', flat)
    expect(cost(3)).toBe(0)
    expect(cost(2)).toBeGreaterThan(0)
    expect(cost(4)).toBeGreaterThan(0)
  })
})

describe('rng', () => {
  test('is deterministic for a given seed', () => {
    const a = rng(123)
    const b = rng(123)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).toEqual(seqB)
  })
})

describe('solveSchedule (MAKE MATCHES / RESHUFFLE)', () => {
  // Each player ranks the 4 categories 1-4, as in the app
  function appSetup() {
    const categories = ['A', 'B', 'C', 'D']
    const r = rng(42)
    const players = Array.from({ length: 8 }, (_, i) => ({
      name: `P${i}`,
      ranks: Object.fromEntries(shuffle([1, 2, 3, 4], r).map((rank, j) => [categories[j], rank]))
    }))
    return { players, categories, cats: categories.map(name => ({ name, count: 2 })) }
  }
  const pairKey = m => [m.high, m.low].sort().join('-')

  test('a reshuffle shares no pairing with earlier schedules while it can avoid it', () => {
    const setup = appSetup()
    const first = solveSchedule({ ...setup, seed: 1 })
    expect(first.ok).toBe(true)
    expect(first.repeats).toBe(0)

    const second = solveSchedule({ ...setup, seed: 2, history: [first.matchups] })
    expect(second.ok).toBe(true)
    expect(second.repeats).toBe(0)
    const before = new Set(first.matchups.map(pairKey))
    expect(second.matchups.some(m => before.has(pairKey(m)))).toBe(false)
  })

  test('once repeats are unavoidable, it still returns a full schedule', () => {
    const setup = appSetup()
    const history = []
    for (let seed = 1; seed <= 6; seed++) {
      const res = solveSchedule({ ...setup, seed, history })
      expect(res.ok).toBe(true)
      expect(res.matchups).toHaveLength(setup.players.length)
      history.push(res.matchups)
    }
  })

  test('explains why there is no schedule', () => {
    const setup = appSetup()
    const res = solveSchedule({ ...setup, cats: [{ name: 'A', count: 2 }], seed: 1 })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/challenges/i)
  })
})
