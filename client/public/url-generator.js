/**
 * Matchmaker URL Generator
 * 
 * Generates shareable URLs for tournament configurations that can be imported
 * into the Underdog Matchmaking Simulator.
 * 
 * @param {Array} categories - Array of category names (strings)
 * @param {Array} numChallenges - Array of challenge counts per category (numbers)
 * @param {Array} players - Array of player names (strings)
 * @param {Array} ranks - Array of rank arrays, where each inner array contains
 *                       the ranks for one player across all categories
 * @returns {string} - Base64 encoded URL parameter value
 * 
 * @example
 * const categories = ['Speed', 'Memory'];
 * const numChallenges = [4, 2];
 * const players = ['Alice', 'Bob'];
 * const ranks = [[1, 2], [2, 1]]; // Alice: rank 1 in Speed, rank 2 in Memory
 * 
 * const urlParam = generateMatchmakerUrl(categories, numChallenges, players, ranks);
 * const fullUrl = `https://kingleigh.github.io/matchmaker?data=${urlParam}`;
 */
function generateMatchmakerUrl(categories, numChallenges, players, ranks) {
    // Validate inputs
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new Error('Categories must be a non-empty array');
    }
    
    if (!Array.isArray(numChallenges) || numChallenges.length !== categories.length) {
      throw new Error('numChallenges must be an array with same length as categories');
    }
    
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('Players must be a non-empty array');
    }
    
    if (!Array.isArray(ranks) || ranks.length !== players.length) {
      throw new Error('ranks must be an array with same length as players');
    }
    
    // Validate that each player has ranks for all categories
    for (let i = 0; i < ranks.length; i++) {
      if (!Array.isArray(ranks[i]) || ranks[i].length !== categories.length) {
        throw new Error(`Player ${i + 1} must have ranks for all ${categories.length} categories`);
      }
    }
    
    // Build the data string in the format: categories|challengeCounts|players|player1ranks|player2ranks|...
    const categoriesString = categories.join(',');
    const challengeCountsString = numChallenges.join(',');
    const playersString = players.join(',');
    
    const rankSections = ranks.map(playerRanks => playerRanks.join(','));
    
    const dataString = [categoriesString, challengeCountsString, playersString, ...rankSections].join('|');
    
    // Encode as base64
    const encodedData = btoa(dataString);
    
    return encodedData;
  }
  
  /**
   * Helper function to generate a complete URL with the matchmaker data parameter
   * 
   * @param {string} baseUrl - The base URL of the matchmaker (e.g., 'https://kingleigh.github.io/matchmaker')
   * @param {Array} categories - Array of category names (strings)
   * @param {Array} numChallenges - Array of challenge counts per category (numbers)
   * @param {Array} players - Array of player names (strings)
   * @param {Array} ranks - Array of rank arrays for each player
   * @returns {string} - Complete URL with data parameter
   * 
   * @example
   * const url = generateMatchmakerFullUrl(
   *   'https://kingleigh.github.io/matchmaker',
   *   ['Speed', 'Memory'],
   *   [4, 2],
   *   ['Alice', 'Bob'],
   *   [[1, 2], [2, 1]]
   * );
   */
  function generateMatchmakerFullUrl(baseUrl, categories, numChallenges, players, ranks) {
    const urlParam = generateMatchmakerUrl(categories, numChallenges, players, ranks);
    return `${baseUrl}?data=${urlParam}`;
  }
  
  // Export for use in Node.js environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      generateMatchmakerUrl,
      generateMatchmakerFullUrl
    };
  }
  
  // Export for use in ES6 environments (browser)
  if (typeof window !== 'undefined') {
    window.generateMatchmakerUrl = generateMatchmakerUrl;
    window.generateMatchmakerFullUrl = generateMatchmakerFullUrl;
  }
  