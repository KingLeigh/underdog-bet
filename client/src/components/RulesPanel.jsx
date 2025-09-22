import React from 'react'
import './RulesPanel.css'

function RulesPanel({ gameState, playerWagerCount, categories }) {
  return (
    <div className="game-info-panel standard-panel">
      <h2>Rules</h2>
      <table className="game-info-table">
        <tbody>
          <tr>
            <td className="info-label">Starting Points</td>
            <td className="info-value">{gameState?.startingPoints || 100} points</td>
          </tr>
          <tr>
            <td className="info-label">Maximum Bet</td>
            <td className="info-value">
              {gameState?.maxBetSize ? `${gameState.maxBetSize} points` : 'No limit'}
            </td>
          </tr>
          <tr>
            <td className="info-label">Bounty Type</td>
            <td className="info-value">
              {gameState?.bounty || 'None'}
              {gameState?.bounty === 'Fixed' && gameState?.bountyAmount && (
                <span className="bounty-detail"> ({gameState.bountyAmount} points)</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="info-label">Wagers Completed</td>
            <td className="info-value">
              {playerWagerCount ? Object.values(playerWagerCount).reduce((sum, count) => sum + count, 0) : 0}
            </td>
          </tr>
          {categories && categories.length > 0 && (
            <tr>
              <td className="info-label">Categories</td>
              <td className="info-value">
                {categories.join(', ')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default RulesPanel
