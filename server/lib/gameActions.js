// Game rules: processing of gameAction events (start, contests, rankings).
//
// Every action mutates (or replaces) the game object; the caller then sends
// the whole game to everyone in it. The current contest lives inside the
// game as `game.contest` — null between contests, otherwise:
//   { id, number, category, challenge, options, contestants, odds,
//     bets: { playerId: { choice, points } }, betsLockAt, result }
// with `result` null while betting is open and set once the host resolves
// (the Result screen), until the host dismisses it. Clients render this
// state as-is; bet secrecy (picks, contestants' amounts) is presentation.

const { addPoints, playerRegistry } = require('./store');
const persistence = require('./persistence');

// The contest still taking bets or awaiting a winner (not yet resolved)
function liveContest(game) {
  return game.contest && !game.contest.result ? game.contest : null;
}

function newContest(fields) {
  return { id: Date.now(), ...fields, bets: {}, betsLockAt: null, result: null };
}

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

  if (game.contest) {
    delete game.contest.bets[playerId];
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
function calculateBountyAmount(game, contest) {
  const bountyConfig = game.bounty || 'None';

  if (bountyConfig === 'None') {
    return null;
  }

  if (bountyConfig === 'Fixed') {
    return game.bountyAmount || 0;
  }

  // For Min/Max/Average, we need to look at all bets placed on the contest
  const allBets = Object.values(contest.bets).map(bet => bet.points);

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

        // Matchmaking is mandatory (with 2+ categories): the saved schedule
        // must cover exactly the ranked players who will start the game.
        // A stale schedule (player removed, or newly ranked since the save)
        // blocks the start until the host saves fresh matchups.
        if (game.categories.length >= 2) {
          const ranked = game.players.filter(pid => game.playerRankings[pid]).sort();
          const savedFor = [...(game.matchupsFor || [])].sort();
          const fresh = Array.isArray(game.matchups) && game.matchups.length > 0 &&
            ranked.length === savedFor.length &&
            ranked.every((pid, i) => pid === savedFor[i]);
          if (!fresh) {
            console.log(`Game ${game.id}: start blocked - matchups missing or stale`);
            return game;
          }
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
      // Host sets up an unscheduled contest between two players (by
      // playerID) with odds — games without a saved schedule
      const { player1, player2 } = payload;
      if (game.host !== playerID || liveContest(game) || !player1 || !player2 ||
          player1 === player2 || !game.players.includes(player1) || !game.players.includes(player2)) {
        return game;
      }
      game.contest = newContest({
        number: null,
        category: payload.category || '',
        challenge: '',
        options: [game.playerNames[player1], game.playerNames[player2]],
        contestants: [player1, player2],
        odds: [payload.odds1 || 1, payload.odds2 || 1]
      });
      console.log(`Game ${game.id}: contest proposed "${game.contest.options[0]}" vs "${game.contest.options[1]}" (${game.contest.odds.join('/')})`);
      return game;
    }

    case 'makeChoice': {
      // A player bets on the live contest
      const contest = liveContest(game);
      const { choice, points } = payload || {};
      if (!contest || !(choice === 0 || choice === 1) || !Number.isFinite(points)) {
        return game;
      }
      // No bets once the lock deadline has passed
      if (contest.betsLockAt && Date.now() >= contest.betsLockAt) {
        return game;
      }
      // A bet must be positive and can never exceed the player's balance
      // (which also shuts out a non-playing emcee host: no balance)
      if (points <= 0 || points > (game.playerPoints[playerID] || 0)) {
        return game;
      }
      if (game.maxBetSize !== null && game.maxBetSize !== undefined && points > game.maxBetSize) {
        return game;
      }
      // A contestant may only bet on themselves
      if (contest.contestants.includes(playerID) && contest.contestants[choice] !== playerID) {
        return game;
      }
      contest.bets[playerID] = { choice, points };
      return game;
    }

    case 'finishGame': {
      // Host ends the night once the schedule has played out: the Winner
      // screen replaces the board for everyone.
      if (game.host !== playerID || game.status !== 'playing') {
        return game;
      }
      if (liveContest(game)) {
        return game;
      }
      if (Array.isArray(game.matchups) && game.matchups.some(x => !x.played && !x.skipped)) {
        return game; // the show isn't over yet
      }
      const standings = [...game.players]
        .sort((a, b) => (game.playerPoints[b] || 0) - (game.playerPoints[a] || 0))
        .map(pid => ({ playerId: pid, name: game.playerNames[pid], points: game.playerPoints[pid] || 0 }));
      persistence.logEvent(game.id, 'gameFinished', { standings, stats: game.stats || {} });
      console.log(`Game ${game.id}: finished - winner ${standings[0] ? standings[0].name : 'nobody'}`);
      return {
        ...game,
        status: 'finished',
        finishedAt: new Date().toISOString()
      };
    }

    case 'saveMatchups': {
      // Persist a matchmaker schedule into the game (host, lobby only).
      // matchupsFor records which ranked players the schedule covers, so a
      // later roster change makes it stale and re-blocks the start.
      if (game.host !== playerID || game.status !== 'waiting') {
        return game;
      }
      const list = Array.isArray(payload.matchups) ? payload.matchups : null;
      if (!list || list.length === 0) {
        return game;
      }
      const ranked = game.players.filter(pid => game.playerRankings[pid]);
      const rankedSet = new Set(ranked);
      const valid = list.every(m => m &&
        rankedSet.has(m.highId) && rankedSet.has(m.lowId) && m.highId !== m.lowId &&
        (game.categories || []).includes(m.category));
      if (!valid) {
        console.error(`Game ${game.id}: saveMatchups rejected - invalid matchup entries`);
        return game;
      }
      game.matchups = list.map((m, i) => ({
        number: i + 1,
        category: m.category,
        // Optional host-typed challenge name, shown as the contest title
        challenge: typeof m.challenge === 'string' ? m.challenge.trim().slice(0, 80) : '',
        highId: m.highId,
        lowId: m.lowId,
        highRank: m.highRank,
        lowRank: m.lowRank,
        gap: m.gap,
        played: false,
        skipped: false
      }));
      game.matchupsFor = [...ranked].sort();
      console.log(`Game ${game.id}: ${game.matchups.length} matchups saved`);
      return game;
    }

    case 'nextMatchup': {
      // Host starts a scheduled matchup as a wager: by its number when
      // given (the host can run any unresolved matchup, in any order), else
      // the earliest unresolved one. Favorite is pegged at 1x; underdog
      // odds are the host's choice or derived from the rank gap.
      if (game.host !== playerID || game.status !== 'playing') {
        return game;
      }
      if (liveContest(game)) {
        return game;
      }
      const list = game.matchups || [];
      const unresolved = list.filter(x => !x.played && !x.skipped);
      if (unresolved.length === 0) {
        return game;
      }
      const m = payload && payload.number
        ? unresolved.find(x => x.number === payload.number)
        : unresolved[0];
      if (!m) {
        return game;
      }
      // Defensive only — mid-game roster removal has no path today. If it
      // ever happens, refuse loudly rather than silently skipping the
      // matchup: the host should see the problem, not a rearranged show.
      // (A locked or disconnected phone never leaves the roster at all.)
      if (!game.players.includes(m.highId) || !game.players.includes(m.lowId)) {
        console.error(`Game ${game.id}: matchup ${m.number} refers to a player no longer in the game - not proposing`);
        return game;
      }
      const options = [game.playerNames[m.highId], game.playerNames[m.lowId]];
      // Underdog odds: the host's choice when sent (0.5 steps, 1x-10x),
      // else derived from the rank gap (1 + 0.5 per rank, capped at 4x)
      const requested = payload && payload.dogOdds;
      const validOdds = Number.isFinite(requested) &&
        requested >= 1 && requested <= 10 &&
        Math.round(requested * 2) === requested * 2;
      const dogOdds = validOdds
        ? requested
        : Math.min(4, 1 + 0.5 * Math.max(1, m.gap || 1));
      game.contest = newContest({
        number: m.number,
        category: m.category,
        challenge: m.challenge || '',
        options,
        contestants: [m.highId, m.lowId],
        odds: [1, dogOdds]
      });
      console.log(`Game ${game.id}: matchup ${m.number}/${list.length} proposed - "${options[0]}" vs "${options[1]}" (${m.category}, ${dogOdds}x)`);
      return game;
    }

    case 'skipMatchup': {
      // Host declares no contest on an unresolved matchup (prop broke,
      // contestant indisposed, room moved on): it is marked skipped and
      // nobody's points are touched. Only between contests — a live wager
      // is voided with cancelWager instead.
      if (game.host !== playerID || game.status !== 'playing') {
        return game;
      }
      if (liveContest(game)) {
        return game;
      }
      const all = game.matchups || [];
      const open = all.filter(x => !x.played && !x.skipped);
      const target = payload && payload.number
        ? open.find(x => x.number === payload.number)
        : open[0];
      if (!target) {
        return game;
      }
      target.skipped = true;
      console.log(`Game ${game.id}: matchup ${target.number}/${all.length} declared no contest`);
      return game;
    }

    case 'lockBets': {
      // Host locks betting: a 10-second countdown starts, after which no
      // further bets are accepted (enforced in makeChoice by the deadline)
      const contest = liveContest(game);
      if (game.host === playerID && contest && !contest.betsLockAt) {
        contest.betsLockAt = Date.now() + 10000;
        console.log(`Game ${game.id}: bets locking at ${new Date(contest.betsLockAt).toISOString()}`);
      }
      return game;
    }

    case 'cancelWager':
      // Host cancels the live contest - no points awarded or lost
      if (game.host === playerID && liveContest(game)) {
        game.contest = null;
        console.log(`Game ${game.id}: contest cancelled - all bets nullified`);
      }
      return game;

    case 'resolveWager': {
      // Host names the winner: points move, and the result joins the
      // contest in game state (the Result screen) until the host moves on
      const contest = liveContest(game);
      if (game.host !== playerID || !contest ||
          !(payload.correctChoice === 0 || payload.correctChoice === 1)) {
        return game;
      }
      const correctChoice = payload.correctChoice;
      const bountyAmount = calculateBountyAmount(game, contest);
      if (!game.playerWagerCount) game.playerWagerCount = {};

      // The contest winner is the contestant at the correct choice index
      const winnerPlayerId = contest.contestants[correctChoice] || null;

      // Night-long stats, shown on the standings and Winner screens
      if (!game.stats) game.stats = {};
      const statFor = (pid) => {
        if (!game.stats[pid]) {
          game.stats[pid] = { contestWins: 0, contestLosses: 0, betWins: 0, betLosses: 0, totalBet: 0 };
        }
        return game.stats[pid];
      };
      for (const cid of contest.contestants) {
        if (!game.players.includes(cid)) continue;
        if (cid === winnerPlayerId) statFor(cid).contestWins++;
        else statFor(cid).contestLosses++;
      }

      const results = [];
      for (const [pid, { choice, points }] of Object.entries(contest.bets)) {
        const isContestant = contest.contestants.includes(pid);
        if (isContestant) {
          game.playerWagerCount[pid] = (game.playerWagerCount[pid] || 0) + 1;
        }
        statFor(pid).totalBet += points;
        const odds = contest.odds[choice];
        const base = { playerId: pid, playerName: game.playerNames[pid] || 'Unknown Player', choice, points, odds };

        if (choice === correctChoice) {
          // Correct: the stake multiplied by the odds (floored)
          statFor(pid).betWins++;
          const pointsAwarded = Math.floor(points * odds);
          addPoints(game, pid, pointsAwarded);
          results.push({ ...base, correct: true, pointsAwarded, pointsChange: `+${pointsAwarded}`, isWinner: isContestant });
        } else {
          // Wrong: the stake is lost (unaffected by odds), clamped so the
          // balance never drops below the game's minimum balance floor
          statFor(pid).betLosses++;
          const minBalance = game.minBalance || 0;
          const loss = Math.min(points, Math.max(0, (game.playerPoints[pid] || 0) - minBalance));
          addPoints(game, pid, -loss);
          results.push({ ...base, correct: false, pointsAwarded: 0, pointsChange: `-${loss}`, isWinner: false });
        }
      }

      if (bountyAmount && bountyAmount > 0 && winnerPlayerId) {
        addPoints(game, winnerPlayerId, bountyAmount);
      }

      contest.result = { correctChoice, winnerPlayerId, results, bountyAmount: bountyAmount || 0 };

      // A resolved scheduled matchup is marked played. (A cancelled
      // contest deliberately is not: it stays startable.)
      if (contest.number && Array.isArray(game.matchups)) {
        const played = game.matchups.find(x => x.number === contest.number);
        if (played) played.played = true;
      }

      console.log(`Game ${game.id}: contest resolved, winner "${contest.options[correctChoice]}"${bountyAmount ? ` (bounty ${bountyAmount})` : ''}`);

      // Permanent record: the contest, every bet and payout, the bounty
      persistence.logEvent(game.id, 'contestResolved', {
        category: contest.category || '',
        challenge: contest.challenge || '',
        matchupNumber: contest.number || null,
        contestants: contest.contestants,
        options: contest.options,
        odds: contest.odds,
        winnerPlayerId,
        winningOption: contest.options[correctChoice],
        bountyAmount: bountyAmount || 0,
        results
      });
      return game;
    }

    case 'dismissResult':
      // Host moves on from the Result screen (Next Matchup): everyone
      // leaves the result together, and the host picks the next contest
      if (game.host === playerID && game.contest && game.contest.result) {
        game.contest = null;
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
        }
      }
      return game;

    default:
      return game;
  }
}

module.exports = { processGameAction };
