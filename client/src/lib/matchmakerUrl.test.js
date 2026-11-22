// Round-trip and validation tests for the matchmaker share-URL encoding.
// The decode side mirrors Matchmaker.jsx's ?data= parser, so these pin the
// wire format both ends must agree on.

import { describe, test, expect } from 'vitest'
import { encodeMatchmakerConfig, buildMatchmakerConfigUrl } from './matchmakerUrl'

// The parse logic used by Matchmaker.jsx for the ?data= parameter
function decode(encoded) {
  const sections = atob(encoded).split('|')
  const categories = sections[0].split(',')
  const counts = sections[1].split(',').map(Number)
  const players = sections[2].split(',')
  const ranks = sections.slice(3).map(s => s.split(',').map(Number))
  return { categories, counts, players, ranks }
}

describe('encodeMatchmakerConfig', () => {
  test('round-trips through the Matchmaker parser', () => {
    const categories = ['Speed', 'Memory', 'Luck']
    const counts = [4, 2, 1]
    const players = ['Alice', 'Bob']
    const ranks = [[1, 2, 3], [3, 1, 2]]

    const decoded = decode(encodeMatchmakerConfig(categories, counts, players, ranks))
    expect(decoded.categories).toEqual(categories)
    expect(decoded.counts).toEqual(counts)
    expect(decoded.players).toEqual(players)
    expect(decoded.ranks).toEqual(ranks)
  })

  test('rejects mismatched shapes', () => {
    expect(() => encodeMatchmakerConfig([], [1], ['A'], [[1]])).toThrow()
    expect(() => encodeMatchmakerConfig(['C'], [1, 2], ['A'], [[1]])).toThrow()
    expect(() => encodeMatchmakerConfig(['C'], [1], [], [])).toThrow()
    expect(() => encodeMatchmakerConfig(['C'], [1], ['A'], [])).toThrow()
    expect(() => encodeMatchmakerConfig(['C', 'D'], [1, 1], ['A'], [[1]])).toThrow()
  })
})

describe('buildMatchmakerConfigUrl', () => {
  test('produces a ?data= URL on the given base', () => {
    const url = buildMatchmakerConfigUrl('https://example.test/matchmaker', ['C'], [1], ['A'], [[1]])
    expect(url.startsWith('https://example.test/matchmaker?data=')).toBe(true)
    const encoded = url.split('?data=')[1]
    expect(decode(encoded).players).toEqual(['A'])
  })
})
