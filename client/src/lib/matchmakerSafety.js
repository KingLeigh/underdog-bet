/**
 * Matchup safety assessment: for a category configuration, estimate whether a
 * full matchup schedule is likely to exist for a given number of players.
 *
 * There is no absolute guarantee — identical rankings from every player break
 * any configuration — so verdicts are probabilistic, measured by running the
 * real feasibility check against randomly ranked players. Timeouts count as
 * failures, which makes the meter conservative.
 */

import { rng, shuffle, checkFeasible, buildChallenges } from './matchmakerSolver'

// Players with uniformly random self-rankings
export function randomRankedPlayers(categoryNames, numPlayers, rand) {
  const M = categoryNames.length
  return Array.from({ length: numPlayers }, (_, i) => {
    const perm = shuffle(Array.from({ length: M }, (_, k) => k + 1), rand)
    const ranks = {}
    categoryNames.forEach((name, k) => { ranks[name] = perm[k] })
    return { name: `P${i + 1}`, ranks }
  })
}

/**
 * Verdict for one player count against a category config [{ name, count }].
 * Returns { verdict: 'safe' | 'risky' | 'unsafe', infeasible, ran } or null
 * when cancelled. Stops early once clearly unsafe; yields to the event loop
 * between batches so it can run during typing.
 */
export async function assessPlayerCount(cats, numPlayers, {
  trials = 50,
  timeLimitMs = 80,
  unsafeAt = 7, // infeasible count that proves "unsafe" (>= ~14%)
  safeAt = 1, // max infeasible count still called "safe" (<= 2%)
  seed = 1,
  yieldEvery = 5,
  isCancelled = () => false
} = {}) {
  const names = cats.map(c => c.name)
  const challenges = buildChallenges(cats)
  const rand = rng(seed)

  let infeasible = 0
  for (let t = 0; t < trials; t++) {
    if (isCancelled()) return null
    const players = randomRankedPlayers(names, numPlayers, rand)
    const ok = checkFeasible(players, names, challenges, {
      selectN: numPlayers,
      requireCoverAll: false,
      timeLimitMs
    })
    if (!ok) {
      infeasible++
      if (infeasible >= unsafeAt) {
        return { verdict: 'unsafe', infeasible, ran: t + 1 }
      }
    }
    if ((t + 1) % yieldEvery === 0) {
      await new Promise(r => setTimeout(r))
    }
  }

  return {
    verdict: infeasible <= safeAt ? 'safe' : 'risky',
    infeasible,
    ran: trials
  }
}

// Stable seed per configuration + player count, so verdicts don't flicker
// between recomputes of the same config
export function configSeed(cats, numPlayers) {
  let h = numPlayers * 7919
  for (const c of cats) {
    for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    h = (h * 131 + c.count) >>> 0
  }
  return (h % 2147483646) + 1
}
