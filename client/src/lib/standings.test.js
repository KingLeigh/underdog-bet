import { describe, it, expect } from 'vitest'
import { rankPlayers, positionsBefore } from './standings'

const st = (contestWins, betWins, totalBet) =>
  ({ contestWins, contestLosses: 0, betWins, betLosses: 0, totalBet })

const order = (ranked) => ranked.map(p => `${p.id}:${p.position}`).join(' ')

describe('rankPlayers', () => {
  it('orders by points', () => {
    const ranked = rankPlayers(
      [{ id: 'a', name: 'A', points: 90 }, { id: 'b', name: 'B', points: 120 }],
      {}
    )
    expect(order(ranked)).toBe('b:1 a:2')
  })

  it('breaks a points tie by contests won, then bets won, then total wagered', () => {
    const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, points: 100 }))
    const stats = {
      a: st(1, 2, 50),
      b: st(2, 0, 10), // most contests won
      c: st(1, 3, 10), // same contests as a, more bets won
      d: st(1, 2, 80) // same as a, more wagered
    }
    expect(order(rankPlayers(players, stats))).toBe('b:1 c:2 d:3 a:4')
  })

  it('shares a position only when everything is level, listing by name', () => {
    const players = [
      { id: 'z', name: 'Zed', points: 100 },
      { id: 'y', name: 'Amy', points: 100 },
      { id: 'x', name: 'Max', points: 80 }
    ]
    expect(order(rankPlayers(players, {}))).toBe('y:1 z:1 x:3')
  })
})

describe('positionsBefore', () => {
  it('takes the round back out of points and every tiebreak stat', () => {
    // Before: a and b level on 100 points, b ahead on contests won (1 vs 0).
    // Contest: a beats c, collecting a 20 bounty and nothing else; b lost a
    // 20 bet. After: a 120, b 80.
    const players = [
      { id: 'a', name: 'A', points: 120 },
      { id: 'b', name: 'B', points: 80 },
      { id: 'c', name: 'C', points: 100 }
    ]
    const stats = { a: st(1, 0, 0), b: st(1, 0, 20), c: st(0, 0, 0) }
    const result = {
      winnerPlayerId: 'a',
      bountyAmount: 20,
      results: [{ playerId: 'b', points: 20, correct: false, pointsChange: '-20' }]
    }
    const before = positionsBefore(players, stats, result)
    // b: 100 pts, 1 contest win; a: 100 pts, 0 wins; c: 100, 0 wins, 0 wagered
    expect(before.get('b')).toBe(1)
    expect(before.get('a')).toBe(2)
    expect(before.get('c')).toBe(2)
  })
})
