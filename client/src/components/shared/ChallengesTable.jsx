import React from 'react'
import './challenges.css'

// Challenges table with click-to-deselect rows and a "Show Rules" link per row.
function ChallengesTable({ challenges, deselectedChallenges, onToggleChallenge, onShowRules }) {
  return (
    <div className="challenges-table-container">
      <table className="challenges-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Challenge Name</th>
            <th>Requirements</th>
            <th>Rules</th>
          </tr>
        </thead>
        <tbody>
          {challenges.map(challenge => {
            const isDeselected = deselectedChallenges.has(challenge.id)
            return (
              <tr
                key={challenge.id}
                className={isDeselected ? 'deselected-row' : ''}
                onClick={() => onToggleChallenge(challenge.id)}
                style={{ cursor: 'pointer' }}
              >
                <td className="challenge-category">{challenge.category}</td>
                <td className="challenge-name">{challenge.challengeName}</td>
                <td className="challenge-requirements">{challenge.requirements}</td>
                <td className="challenge-rules">
                  <a
                    href="#"
                    className="rules-link"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onShowRules(challenge)
                    }}
                  >
                    Show Rules
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default ChallengesTable
