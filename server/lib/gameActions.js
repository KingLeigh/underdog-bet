// Game rules: processing of gameAction events (start, wagers, rankings).

const { wagerStates, addPoints, playerRegistry } = require('./store');

// Remove a player from a game entirely (host kick, or dropped at game start
// for not submitting rankings). Notifies the removed player and detaches
// them from the game so a later join with the same name starts fresh.
function removePlayerFromGame(io, game, playerId, reason) {
  game.players = game.players.filter(id => id !== playerId);
  delete game.playerPoints[playerId];
  delete game.playerNames[playerId];
  delete game.playerRankings[playerId];
  if (game.playerWagerCount) {
    delete game.playerWagerCount[playerId];
  }

  const wagerState = wagerStates.get(game.id);
  if (wagerState) {
    delete wagerState.playerChoices[playerId];
  }

  const playerData = playerRegistry.get(playerId);
  if (playerData) {
    if (playerData.socketID) {
      io.to(playerData.socketID).emit('removedFromGame', { gameId: game.id, reason });
      io.in(playerData.socketID).socketsLeave(game.id);
    }
    playerData.gameId = null;
  }
}

// Recompute whether every (remaining) player has submitted rankings
function recomputeRankingsComplete(game) {
  if (game.categories && game.categories.length > 0) {
    game.rankingsComplete = game.players.length > 0 &&
      game.players.every(pid => game.playerRankings[pid]);
  }
}

// Bounty calculation
function calculateBountyAmount(game, wagerState) {
  const bountyConfig = game.bounty || 'None';

  if (bountyConfig === 'None') {
    return null;
  }

  if (bountyConfig === 'Fixed') {
    return game.bountyAmount || 0;
  }

  // For Min/Max/Average, we need to look at all bets placed on the wager
  const allBets = Object.values(wagerState.playerChoices).map(choice => choice.points);

  if (allBets.length === 0) {
    return 0;
  }

  switch (bountyConfig) {
    case 'Min':
      return Math.min(...allBets);
    case 'Max':
      return Math.max(...allBets);
    case 'Average':
      return Math.floor(allBets.reduce((sum, bet) => sum + bet, 0) / allBets.length);
    default:
      return null;
  }
}

// Process a gameAction and return the (possibly new) game state
function processGameAction(io, game, action, payload, playerID) {
  switch (action) {
    case 'startGame': {
      // Host-only. In a game with categories, starting drops any player who
      // hasn't submitted rankings — a half-signed-up player can never block
      // the start. At least 2 ready players are required.
      if (game.host !== playerID || game.status !== 'waiting') {
        return game;
      }

      if (game.categories && game.categories.length > 0) {
        const unranked = game.players.filter(pid => !game.playerRankings[pid]);
        if (game.players.length - unranked.length < 2) {
          return game;
        }
        for (const pid of unranked) {
          console.log(`Game ${game.id}: dropping ${game.playerNames[pid]} (${pid}) at start - no rankings submitted`);
          removePlayerFromGame(io, game, pid, 'The game started without you because your rankings were not submitted');
        }
        recomputeRankingsComplete(game);
      } else if (game.players.length < 2) {
        return game;
      }

      return {
        ...game,
        status: 'playing',
        gameStartedAt: new Date().toISOString()
      };
    }

    case 'removePlayer': {
      // Host removes a player from a waiting game (no-shows, typo ghosts).
      // The host cannot remove themselves.
      const targetId = payload && payload.playerId;
      if (game.host !== playerID || game.status !== 'waiting') {
        return game;
      }
      if (!targetId || targetId === game.host || !game.players.includes(targetId)) {
        return game;
      }

      console.log(`Game ${game.id}: host removed ${game.playerNames[targetId]} (${targetId})`);
      removePlayerFromGame(io, game, targetId, 'You were removed from the game by the host');
      recomputeRankingsComplete(game);
      return game;
    }

    case 'proposeWager': {
      // Host proposes a wager between two players (by playerID) with odds
      const { player1, player2 } = payload;
      if (game.host === playerID && player1 && player2 && player1 !== player2 &&
          game.players.includes(player1) && game.players.includes(player2)) {
        // Extract odds from payload, defaulting to 1 if not provided
        const odds1 = payload.odds1 || 1;
        const odds2 = payload.odds2 || 1;
        const category = payload.category || '';
        const options = [game.playerNames[player1], game.playerNames[player2]];

        wagerStates.set(game.id, {
          isActive: true,
          options: options,
          contestants: [player1, player2],
          odds: [odds1, odds2],
          category: category,
          playerChoices: {},
          resolved: false,
          correctOption: null,
          betsLockAt: null // epoch ms deadline once the host locks betting
        });

        console.log(`Game ${game.id}: wager proposed "${options[0]}" (${odds1}x) vs "${options[1]}" (${odds2}x)${category ? ` in ${category}` : ''}`);

        // Emit wager proposed event to all players
        io.to(game.id).emit('wagerProposed', {
          options: options,
          contestants: [player1, player2],
          odds: [odds1, odds2],
          category: category,
          betsLockAt: null
        });
      } else {
        console.error(`Invalid wager proposal in game ${game.id}:`, {
          isHost: game.host === playerID,
          player1,
          player2
        });
      }
      return game;
    }

    case 'makeChoice':
      // Player makes a choice on the current wager with points
      if (payload.choice !== undefined && payload.choice >= 0 && payload.choice <= 1 && payload.points !== undefined) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          // No bets once the lock deadline has passed
          if (wagerState.betsLockAt && Date.now() >= wagerState.betsLockAt) {
            return game;
          }

          const currentPoints = game.playerPoints[playerID] || 0;

          // A bet must be positive and can never exceed the player's balance
          if (payload.points <= 0 || payload.points > currentPoints) {
            return game;
          }

          // Apply game-level maximum bet size limit if configured
          if (game.maxBetSize !== null && game.maxBetSize !== undefined &&
              payload.points > game.maxBetSize) {
            return game;
          }

          // Prevent players from betting against themselves
          const isPlayerInContest = wagerState.contestants.includes(playerID);

          if (isPlayerInContest && wagerState.contestants[payload.choice] !== playerID) {
            // Player is in the contest - they can only bet on themselves
            return game;
          }

          // Store the choice and wager amount
          wagerState.playerChoices[playerID] = {
            choice: payload.choice,
            points: payload.points
          };

          // Emit choice made event to all players (reveal points but keep choice secret)
          io.to(game.id).emit('choiceMade', {
            playerId: playerID,
            playerName: game.playerNames[playerID] || 'Unknown Player',
            hasChosen: true,
            choice: null, // Don't reveal the choice until resolution
            points: payload.points // Show the wager amount for tension
          });
        }
      }
      return game;

    case 'lockBets': {
      // Host locks betting: a 10-second countdown starts, after which no
      // further bets are accepted (enforced in makeChoice by the deadline)
      if (game.host === playerID) {
        const wagerState = wagerStates.get(game.id);
        if (wagerState && wagerState.isActive && !wagerState.resolved && !wagerState.betsLockAt) {
          wagerState.betsLockAt = Date.now() + 10000;
          io.to(game.id).emit('betsLocking', { betsLockAt: wagerState.betsLockAt });
          console.log(`Game ${game.id}: bets locking at ${new Date(wagerState.betsLockAt).toISOString()}`);
        }
      }
      return game;
    }

    case 'cancelWager':
      // Host cancels the wager - no points awarded or lost
      if (game.host === playerID) {
        const wagerState = wagerStates.get(game.id);

        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          // Clear the wager state completely
          wagerStates.delete(game.id);
          console.log(`Game ${game.id}: wager cancelled - all bets nullified`);

          // Emit cancellation event to all players
          io.to(game.id).emit('wagerCancelled');
        }
      }
      return game;

    case 'resolveWager':
      // Host resolves the wager and awards points
      if (game.host === playerID && payload.correctChoice !== undefined) {
        const wagerState = wagerStates.get(game.id);

        if (wagerState && wagerState.isActive && !wagerState.resolved) {
          wagerState.resolved = true;
          wagerState.correctOption = payload.correctChoice;

          // Calculate bounty amount
          const bountyAmount = calculateBountyAmount(game, wagerState);

          // Initialize playerWagerCount if it doesn't exist
          if (!game.playerWagerCount) {
            game.playerWagerCount = {};
          }

          let results = [];

          // The contest winner is the contestant at the correct choice index
          const winnerPlayerId = wagerState.contestants[payload.correctChoice] || null;
          const winningOption = wagerState.options[payload.correctChoice];

          for (const [playerId, choiceData] of Object.entries(wagerState.playerChoices)) {
            const { choice, points } = choiceData;

            // Check if this player is one of the two being compared in the contest
            const isPlayerInContest = wagerState.contestants.includes(playerId);

            // Only increment wager count for players who are actually in the contest
            if (isPlayerInContest) {
              game.playerWagerCount[playerId] = (game.playerWagerCount[playerId] || 0) + 1;
            }

            if (choice === payload.correctChoice) {
              // Player was correct - they gain the points they wagered MULTIPLIED BY the odds
              const odds = wagerState.odds[choice];
              const pointsAwarded = Math.floor(points * odds);
              addPoints(game, playerId, pointsAwarded);

              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                odds: odds,
                correct: true,
                pointsAwarded: pointsAwarded,
                pointsChange: `+${pointsAwarded}`,
                isWinner: isPlayerInContest
              });
            } else {
              // Player was incorrect - they lose their stake (unaffected by
              // odds), clamped so their balance never drops below the game's
              // minimum balance floor
              const minBalance = game.minBalance || 0;
              const loss = Math.min(points, Math.max(0, (game.playerPoints[playerId] || 0) - minBalance));
              addPoints(game, playerId, -loss);
              results.push({
                playerId,
                playerName: game.playerNames[playerId] || 'Unknown Player',
                choice,
                points,
                odds: wagerState.odds[choice],
                correct: false,
                pointsAwarded: 0,
                pointsChange: `-${loss}`,
                isWinner: false
              });
            }
          }

          // Award bounty to the winner if applicable
          if (bountyAmount && bountyAmount > 0 && winnerPlayerId) {
            addPoints(game, winnerPlayerId, bountyAmount);
          }

          console.log(`Game ${game.id}: wager resolved, winner "${winningOption}"${bountyAmount ? ` (bounty ${bountyAmount})` : ''}`);

          // Emit wager resolved event to all players
          io.to(game.id).emit('wagerResolved', {
            correctChoice: payload.correctChoice,
            results,
            wagerState: wagerState,
            bountyAmount: bountyAmount,
            winnerPlayerId: winnerPlayerId
          });

          // Reset wager state for next round
          wagerState.isActive = false;
          wagerState.options = [];
          wagerState.contestants = [];
          wagerState.odds = [1, 1]; // Reset to default odds
          wagerState.playerChoices = {};
          wagerState.correctOption = null;
          wagerState.resolved = false;
        } else {
          console.error(`Cannot resolve wager for game ${game.id}:`, {
            hasWagerState: !!wagerState,
            isActive: wagerState?.isActive,
            isResolved: wagerState?.resolved
          });
        }
      } else {
        console.error(`Invalid wager resolution in game ${game.id}:`, {
          isHost: game.host === playerID,
          hasCorrectChoice: payload.correctChoice !== undefined
        });
      }
      return game;

    case 'submitRankings':
      // Player submits their category rankings
      if (payload.rankings && game.categories && game.categories.length > 0) {
        // Validate rankings
        const expectedRanks = game.categories.length;
        const submittedRanks = Object.values(payload.rankings);

        // Check if all categories are ranked
        if (submittedRanks.length !== expectedRanks) {
          return game;
        }

        // Check if ranks are unique and valid (1 to expectedRanks)
        const validRanks = new Set(Array.from({length: expectedRanks}, (_, i) => i + 1));
        const submittedRanksSet = new Set(submittedRanks);

        if (submittedRanksSet.size !== expectedRanks ||
            !submittedRanks.every(rank => validRanks.has(rank))) {
          return game;
        }

        // Store the rankings
        game.playerRankings[playerID] = payload.rankings;

        // Check if all players have submitted rankings
        const allPlayersRanked = game.players.every(pid => game.playerRankings[pid]);
        if (allPlayersRanked) {
          game.rankingsComplete = true;
          console.log(`Game ${game.id}: all players have submitted rankings`);

          // Emit rankings complete event
          io.to(game.id).emit('rankingsComplete', {
            playerRankings: game.playerRankings,
            categories: game.categories
          });
        } else {
          // Emit ranking submitted event
          io.to(game.id).emit('rankingSubmitted', {
            playerId: playerID,
            playerName: game.playerNames[playerID],
            totalPlayers: game.players.length,
            rankedPlayers: Object.keys(game.playerRankings).length
          });
        }
      }
      return game;

    default:
      return game;
  }
}

module.exports = { processGameAction };
