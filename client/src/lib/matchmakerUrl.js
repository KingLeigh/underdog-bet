/**
 * Matchmaker share-URL encoding.
 *
 * A matchmaker configuration is encoded as a base64 `?data=` parameter in the
 * format: categories|challengeCounts|players|player1ranks|player2ranks|...
 * (each section comma-separated). Matchmaker.jsx parses this same format.
 */

/**
 * @param {string[]} categories - Category names
 * @param {number[]} numChallenges - Challenge counts per category
 * @param {string[]} players - Player names
 * @param {number[][]} ranks - Per-player rank arrays across all categories
 * @returns {string} Base64 encoded `data` parameter value
 */
export function encodeMatchmakerConfig(categories, numChallenges, players, ranks) {
  // Validate inputs
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('Categories must be a non-empty array')
  }

  if (!Array.isArray(numChallenges) || numChallenges.length !== categories.length) {
    throw new Error('numChallenges must be an array with same length as categories')
  }

  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('Players must be a non-empty array')
  }

  if (!Array.isArray(ranks) || ranks.length !== players.length) {
    throw new Error('ranks must be an array with same length as players')
  }

  // Validate that each player has ranks for all categories
  for (let i = 0; i < ranks.length; i++) {
    if (!Array.isArray(ranks[i]) || ranks[i].length !== categories.length) {
      throw new Error(`Player ${i + 1} must have ranks for all ${categories.length} categories`)
    }
  }

  const sections = [
    categories.join(','),
    numChallenges.join(','),
    players.join(','),
    ...ranks.map(playerRanks => playerRanks.join(','))
  ]

  return btoa(sections.join('|'))
}

/**
 * Complete matchmaker URL with the `?data=` parameter.
 */
export function buildMatchmakerConfigUrl(baseUrl, categories, numChallenges, players, ranks) {
  return `${baseUrl}?data=${encodeMatchmakerConfig(categories, numChallenges, players, ranks)}`
}
