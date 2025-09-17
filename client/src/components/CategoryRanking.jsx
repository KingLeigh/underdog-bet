import React, { useState, useEffect } from 'react'
import './CategoryRanking.css'

function CategoryRanking({ categories, onSubmit, onCancel }) {
  const [rankedCategories, setRankedCategories] = useState([])
  const [nextRank, setNextRank] = useState(1)

  // Initialize categories with random order
  useEffect(() => {
    if (categories && categories.length > 0) {
      // Create a shuffled copy of categories
      const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)
      
      setRankedCategories(shuffledCategories.map((category) => ({
        id: category,
        name: category,
        rank: null // No rank assigned initially
      })))
      setNextRank(1) // Reset next rank to 1
    }
  }, [categories])

  // Handle category item click
  const handleCategoryClick = (categoryId) => {
    setRankedCategories(prevCategories => {
      return prevCategories.map(category => {
        if (category.id === categoryId) {
          if (category.rank === null) {
            // Assign new rank
            return { ...category, rank: nextRank }
          } else if (category.rank === nextRank - 1) {
            // Unset the highest rank (most recently assigned)
            return { ...category, rank: null }
          }
        }
        return category
      })
    })
    
    // Update nextRank based on whether we're setting or unsetting
    const clickedCategory = rankedCategories.find(cat => cat.id === categoryId)
    if (clickedCategory && clickedCategory.rank === null) {
      // Setting a new rank
      setNextRank(prevRank => prevRank + 1)
    } else if (clickedCategory && clickedCategory.rank === nextRank - 1) {
      // Unsetting the highest rank
      setNextRank(prevRank => prevRank - 1)
    }
  }

  // Check if all categories have been ranked
  const allCategoriesRanked = rankedCategories.every(category => category.rank !== null)

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


  if (!categories || categories.length === 0) {
    return null
  }

  return (
    <div className="category-ranking">
      <div className="ranking-header">
        <h3>Rank Your Categories</h3>
        <p>Click each category in order of preference. Rank 1 is your strongest, {categories.length} is your weakest.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="ranking-form">
        <div className="categories-list">
          {rankedCategories.map((item, index) => {
            const isClickable = item.rank === null || item.rank === nextRank - 1
            const isHighestRank = item.rank === nextRank - 1
            
            return (
              <div
                key={item.id}
                className={`category-item ${isClickable ? 'clickable' : 'ranked'} ${isHighestRank ? 'highest-rank' : ''}`}
                onClick={() => isClickable && handleCategoryClick(item.id)}
              >
                <div className="rank-number">
                  {item.rank ? `#${item.rank}` : ''}
                </div>
                <div className="category-content">
                  <span className="category-name">{item.name}</span>
                </div>
              </div>
            )
          })}
        </div>
        
        <div className="ranking-actions">
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!allCategoriesRanked}
          >
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

export default CategoryRanking
