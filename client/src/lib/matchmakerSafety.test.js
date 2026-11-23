// The safety meter's verdicts should match the measured feasibility law:
// two categories are never safe, four with spare challenges are.

import { describe, test, expect } from 'vitest'
import { assessPlayerCount, configSeed } from './matchmakerSafety'

describe('assessPlayerCount', () => {
  test('two categories are unsafe', async () => {
    const cats = [{ name: 'A', count: 5 }, { name: 'B', count: 5 }]
    const res = await assessPlayerCount(cats, 8, { seed: configSeed(cats, 8) })
    expect(res.verdict).toBe('unsafe')
    expect(res.ran).toBeLessThan(50) // early-stopped once clearly unsafe
  })

  test('four categories with spare challenges are safe', async () => {
    const cats = ['A', 'B', 'C', 'D'].map(name => ({ name, count: 3 }))
    const res = await assessPlayerCount(cats, 8, { seed: configSeed(cats, 8) })
    expect(res.verdict).toBe('safe')
  })

  test('cancellation returns null', async () => {
    const cats = [{ name: 'A', count: 4 }, { name: 'B', count: 4 }]
    const res = await assessPlayerCount(cats, 8, { isCancelled: () => true })
    expect(res).toBeNull()
  })

  test('configSeed is stable and config-sensitive', () => {
    const cats = [{ name: 'A', count: 2 }, { name: 'B', count: 2 }]
    expect(configSeed(cats, 6)).toBe(configSeed(cats, 6))
    expect(configSeed(cats, 6)).not.toBe(configSeed(cats, 7))
    expect(configSeed(cats, 6)).not.toBe(configSeed([{ name: 'A', count: 3 }, { name: 'B', count: 2 }], 6))
  })
})
