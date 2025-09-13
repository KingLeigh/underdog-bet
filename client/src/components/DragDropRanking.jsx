import React, { useState, useEffect } from 'react'
import './DragDropRanking.css'

function DragDropRanking({ categories, onSubmit, onCancel }) {
  const [rankedCategories, setRankedCategories] = useState([])

  // Initialize categories with random order
  useEffect(() => {
    if (categories && categories.length > 0) {
      // Create a shuffled copy of categories
      const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)
      
      setRankedCategories(shuffledCategories.map((category, index) => ({
        id: category,
        name: category,
        rank: index + 1
      })))
    }
  }, [categories])

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Convert to the expected format: { category: rank }
    const rankings = {}
    rankedCategories.forEach(item => {
      rankings[item.name] = item.rank
    })
    
    onSubmit(rankings)
  }

  // Shuffle categories randomly
  const shuffleCategories = () => {
    const shuffled = [...rankedCategories].sort(() => Math.random() - 0.5)
    shuffled.forEach((item, index) => {
      item.rank = index + 1
    })
    setRankedCategories(shuffled)
  }

  if (!categories || categories.length === 0) {
    return null
  }

  return (
    <div className="drag-drop-ranking">
      <div className="ranking-header">
        <h3>Rank Your Categories</h3>
        <p>Use the shuffle button to randomize the order. Rank 1 is your strongest, {categories.length} is your weakest.</p>
        <button 
          type="button" 
          className="btn btn-secondary shuffle-btn"
          onClick={shuffleCategories}
        >
          🔀 Shuffle Order
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="ranking-form">
        <div className="categories-list">
          {rankedCategories.map((item, index) => (
            <div
              key={item.id}
              className="category-item"
            >
              <div className="rank-number">#{item.rank}</div>
              <div className="category-content">
                <span className="category-name">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="ranking-actions">
          <button type="submit" className="btn btn-primary">
            Submit Rankings
          </button>
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default DragDropRanking
