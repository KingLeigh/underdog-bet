import React from 'react'
import './challenges.css'

// Modal showing a single challenge's rules. Renders nothing without a challenge.
function RulesModal({ challenge, onClose }) {
  if (!challenge) return null

  return (
    <div className="rules-modal-overlay" onClick={onClose}>
      <div className="rules-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="rules-modal-header">
          <h3>{challenge.challengeName}</h3>
          <button className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="rules-modal-body">
          <div className="challenge-info">
            <p><strong>Category:</strong> {challenge.category}</p>
            <p><strong>Requirements:</strong> {challenge.requirements}</p>
          </div>
          <div className="rules-content">
            <h4>Rules</h4>
            <p>{challenge.rules}</p>
          </div>
        </div>
        <div className="rules-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default RulesModal
