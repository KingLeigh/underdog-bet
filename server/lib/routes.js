// REST API endpoints.

const { gameSessions, wagerStates, getPlayerPoints, getWagerState } = require('./store');
const { getChallenges } = require('./challenges');

function registerRoutes(app) {
  app.get('/api/games', (req, res) => {
    const games = Array.from(gameSessions.values()).map(game => ({
      id: game.id,
      status: game.status,
      playerCount: game.players.length,
      createdAt: game.createdAt,
      playerPoints: game.playerPoints
    }));
    res.json(games);
  });

  app.get('/api/games/:id', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      res.json(game);
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });

  // Get points for a specific player in a game
  app.get('/api/games/:id/players/:playerId/points', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      const playerId = req.params.playerId;
      const points = getPlayerPoints(game, playerId);
      res.json({ playerId, points, gameId: req.params.id });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });

  // Get all player points for a game
  app.get('/api/games/:id/points', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      res.json({ gameId: req.params.id, playerPoints: game.playerPoints });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });

  // Get wager state for a game
  app.get('/api/games/:id/wager', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      const wagerState = getWagerState(req.params.id);
      res.json({ gameId: req.params.id, wagerState });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });

  // Get challenges (with caching)
  app.get('/api/challenges', async (req, res) => {
    try {
      const challenges = await getChallenges();
      res.json(challenges);
    } catch (error) {
      console.error('Error fetching challenges:', error);
      res.status(500).json({ error: 'Failed to fetch challenges' });
    }
  });

  // Debug endpoint to check game state
  app.get('/api/debug/games/:id', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      const wagerState = getWagerState(req.params.id);
      res.json({
        gameId: req.params.id,
        players: game.players,
        playerNames: game.playerNames,
        playerPoints: game.playerPoints,
        status: game.status,
        wagerState: wagerState
      });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });

  // Debug endpoint specifically for wager state
  app.get('/api/debug/games/:id/wager', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (game) {
      const wagerState = getWagerState(req.params.id);
      res.json({
        gameId: req.params.id,
        gameStatus: game.status,
        hostId: game.host,
        wagerState: wagerState,
        wagerStatesMap: Array.from(wagerStates.entries()).map(([id, state]) => ({ id, state }))
      });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  });
}

module.exports = { registerRoutes };
