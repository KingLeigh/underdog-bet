// REST API endpoints.

const { gameSessions, wagerStates, getPlayerPoints, getWagerState, deleteGame } = require('./store');
const { processGameAction } = require('./gameActions');
const persistence = require('./persistence');

function registerRoutes(app, io) {
  app.get('/api/games', (req, res) => {
    const games = Array.from(gameSessions.values()).map(game => {
      const wagerState = wagerStates.get(game.id);
      return {
        id: game.id,
        status: game.status,
        playerCount: game.players.length,
        hostName: game.playerNames[game.host] || 'Unknown',
        wagerActive: !!(wagerState && wagerState.isActive && !wagerState.resolved),
        createdAt: game.createdAt,
        playerPoints: game.playerPoints
      };
    });
    res.json(games);
  });

  // Save a matchmaker schedule into a waiting game. The Matchmaker tab is
  // fetch-based (no socket), so this is its write path; the lobby hears
  // about it through the gameStateUpdate broadcast.
  app.post('/api/games/:id/matchups', (req, res) => {
    const game = gameSessions.get(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const before = game.matchups;
    processGameAction(io, game, 'saveMatchups', { matchups: req.body && req.body.matchups }, game.host);
    if (game.matchups === before) {
      return res.status(400).json({ error: 'Matchups rejected: game must be in the lobby and every matchup must pair two ranked players in a game category' });
    }
    if (io) io.to(game.id).emit('gameStateUpdate', game);
    persistence.saveGame(game.id);
    persistence.logEvent(game.id, 'saveMatchups', { count: game.matchups.length });
    res.json({ ok: true, count: game.matchups.length });
  });

  // Delete a game entirely (game manager). Connected players are told and
  // kicked; the events history stays in the database.
  app.delete('/api/games/:id', (req, res) => {
    const gameId = req.params.id;
    if (!gameSessions.has(gameId)) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (io) {
      io.to(gameId).emit('removedFromGame', { gameId, reason: 'This game was deleted by the host.' });
      io.in(gameId).socketsLeave(gameId);
    }
    deleteGame(gameId);
    persistence.deleteGame(gameId);
    console.log(`Game ${gameId} deleted via game manager`);
    res.json({ ok: true });
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
