import React, { useEffect, useState } from 'react'
import { assessPlayerCount, configSeed } from '../lib/matchmakerSafety'

const MAX_METER_PLAYERS = 12

// Live matchup-safety meter: for the current category configuration, shows a
// verdict pip per player count, computed by quietly running the real
// feasibility check against randomly ranked players.
function MatchupSafetyMeter({ cats }) {
  const [verdicts, setVerdicts] = useState({}) // n -> 'safe' | 'risky' | 'unsafe'

  const totalChallenges = cats.reduce((sum, c) => sum + c.count, 0)
  const configKey = JSON.stringify(cats)

  useEffect(() => {
    let cancelled = false
    setVerdicts({})
    if (cats.length < 2) return undefined

    // Debounce typing, then assess each player count in turn
    const timer = setTimeout(async () => {
      const maxN = Math.min(MAX_METER_PLAYERS, totalChallenges)
      for (let n = 2; n <= maxN; n++) {
        const res = await assessPlayerCount(cats, n, {
          seed: configSeed(cats, n),
          isCancelled: () => cancelled
        })
        if (cancelled || !res) return
        setVerdicts(prev => ({ ...prev, [n]: res.verdict }))
      }
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  if (cats.length === 0) return null

  if (cats.length === 1) {
    return (
      <div className="safety-meter">
        <div className="cg-help warn">Add at least 2 categories to enable matchups.</div>
      </div>
    )
  }

  const maxN = Math.min(MAX_METER_PLAYERS, totalChallenges)
  const counts = []
  for (let n = 2; n <= maxN; n++) counts.push(n)

  const safeCounts = counts.filter(n => verdicts[n] === 'safe')
  const allDone = counts.every(n => verdicts[n])
  const summary = !allDone
    ? 'Checking player counts…'
    : safeCounts.length > 0
      ? `Safe for ${safeCounts[0]}–${safeCounts[safeCounts.length - 1]} players`
      : 'No safe player count — add categories or challenges'

  return (
    <div className="safety-meter">
      <div className="cg-stepper-label">Matchup safety by player count</div>
      <div className="safety-pips">
        {counts.map(n => (
          <span key={n} className={`pip ${verdicts[n] || 'pending'}`} title={
            verdicts[n] === 'safe' ? 'A full matchup schedule is nearly always possible'
              : verdicts[n] === 'risky' ? 'The schedule sometimes fails with unlucky rankings'
                : verdicts[n] === 'unsafe' ? 'The schedule often fails — add categories or challenges'
                  : 'Checking…'
          }>
            {n}
          </span>
        ))}
      </div>
      <div className="safety-summary">{summary}</div>
      {totalChallenges < MAX_METER_PLAYERS && (
        <div className="cg-help">Max {totalChallenges} players with {totalChallenges} challenges.</div>
      )}
    </div>
  )
}

export default MatchupSafetyMeter
