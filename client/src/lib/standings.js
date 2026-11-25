// The leaderboard order, used everywhere players are ranked: the standings
// table, the 🏆, the ▲▼ moves on the Result screen, the crown on the
// betting chips and the Winner screen.
//
// Points first; level players are separated by contests won, then bets
// won, then total wagered (more is better: the same points from bigger
// risks). Players level on all four share a position (#1, #1, #3), and
// are listed by name.

const NO_STATS = { contestWins: 0, contestLosses: 0, betWins: 0, betLosses: 0, totalBet: 0 }

export const statsFor = (stats, pid) => (stats && stats[pid]) || NO_STATS

// Higher is better at every step
const keyOf = (points, s) => [points, s.contestWins, s.betWins, s.totalBet]

const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i]
  }
  return 0
}

// Competition ranking: a player's position is 1 + how many are strictly ahead
const positionsOf = (entries) => {
  const positions = new Map()
  for (const e of entries) {
    positions.set(e.id, 1 + entries.filter(o => compareKeys(o.key, e.key) < 0).length)
  }
  return positions
}

// players: [{ id, name, points }]; stats: game.stats.
// Returns the players in leaderboard order, each with its `position`.
export function rankPlayers(players, stats) {
  const entries = players.map(p => ({ ...p, key: keyOf(p.points, statsFor(stats, p.id)) }))
  entries.sort((a, b) => compareKeys(a.key, b.key) || String(a.name).localeCompare(String(b.name)))
  const positions = positionsOf(entries)
  return entries.map(({ key, ...p }) => ({ ...p, position: positions.get(p.id) }))
}

// A player's change from one resolved contest: the bet result plus any
// bounty, and whether they took part at all
export function roundChange(result, pid) {
  const r = result.results.find(x => x.playerId === pid)
  const gotBounty = pid === result.winnerPlayerId && result.bountyAmount > 0
  let delta = r ? parseInt(r.pointsChange, 10) : 0
  if (gotBounty) delta += result.bountyAmount
  return { delta, active: !!r || gotBounty }
}

// Positions as they stood before a contest resolved, reconstructed from
// the result alone (no history kept): take this round's part back out of
// the points and of every tiebreak stat.
export function positionsBefore(players, stats, result) {
  const entries = players.map(p => {
    const s = statsFor(stats, p.id)
    const bet = result.results.find(x => x.playerId === p.id)
    const prior = {
      contestWins: s.contestWins - (p.id === result.winnerPlayerId ? 1 : 0),
      betWins: s.betWins - (bet && bet.correct ? 1 : 0),
      totalBet: s.totalBet - (bet ? bet.points : 0)
    }
    return { id: p.id, key: keyOf(p.points - roundChange(result, p.id).delta, prior) }
  })
  return positionsOf(entries)
}
