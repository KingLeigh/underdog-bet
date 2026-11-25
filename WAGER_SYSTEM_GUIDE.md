# Wager System Guide

## Overview

The Underdog Bet game now includes a complete wager system that allows hosts to create betting opportunities and players to make predictions. This system adds real gameplay mechanics to the previously placeholder game board.

## How It Works

### 1. Game Flow
1. **Host creates a game** and starts it
2. **Host proposes a wager** by entering two options
3. **Players make choices** between the two options
4. **Host resolves the wager** by indicating the correct answer
5. **Points are awarded** automatically (100 points for correct choices)

### 2. Wager States

#### Initial State
- No active wager
- Host sees "Propose a Wager" form
- Players see "Waiting for host to propose a wager..."

#### Active Wager
- Two options displayed (Option A and Option B)
- Players can make choices
- Host can see all player choices
- Host can resolve the wager once players have chosen

#### Resolved Wager
- Results displayed showing who was correct
- Points automatically awarded
- Option to start a new wager

## Technical Implementation

### Server Side (`server/lib/gameActions.js`)

#### The contest lives in the game
```javascript
game.contest = null // between contests, otherwise:
{
  id, number, category, challenge,
  options: ['Bob', 'Alice'],     // display names
  contestants: ['p1', 'p2'],      // player IDs
  odds: [1, 2],
  bets: { p3: { choice: 1, points: 20 } },
  betsLockAt: null,               // set by lockBets
  result: null                    // { correctChoice, winnerPlayerId, results, bountyAmount } once resolved
}
```

#### New Game Actions
- `proposeWager` - Host creates a new wager
- `makeChoice` - Player selects an option
- `resolveWager` - Host indicates correct answer

#### State, not events
There are no wager-specific socket events. The contest lives in the game
(`game.contest`) and every change broadcasts the whole game
(`gameStateUpdate`); clients render whatever it says. See the README's
"Socket.IO Protocol" section.

### Client Side

#### GameContext Updates
- Keeps only identity and the latest game state; everything else is derived
- Functions: `proposeWager`, `makeChoice`, `lockBets`, `resolveWager`, `dismissResult`

#### GameBoard Component
- Wager interface section
- Forms for host and player actions
- Real-time display of choices and results

## Example Usage

### Scenario: Sports Betting
1. **Host proposes**: "Will Team A score first?" vs "Will Team B score first?"
2. **Players choose** their prediction
3. **Host resolves** based on actual game outcome
4. **Points awarded** to correct predictors

### Scenario: Trivia
1. **Host proposes**: "Is the answer A?" vs "Is the answer B?"
2. **Players guess** the correct answer
3. **Host reveals** the truth
4. **Points awarded** to those who guessed correctly

## API Endpoints

- `GET /api/games/:id` - The whole game, with the current contest in `contest`

## Troubleshooting

### Common Issues

#### Wager not appearing
- Check if you're the host (only hosts can propose wagers)
- Ensure the game is in "playing" status
- Check browser console for errors

#### Choices not registering
- Verify you're connected to the game
- Check if the wager is still active
- Ensure you haven't already made a choice

#### Points not updating
- Wait for the host to resolve the wager
- Check if the wager was properly resolved
- Verify the correct choice was selected

### Debug Information
- `GET /api/games/:id` returns the whole game, current contest included
- Check browser console for `gameStateUpdate` payloads
- Monitor server logs for action processing

## Future Enhancements

### Potential Improvements
1. **Multiple wager types** (more than 2 options)
2. **Wager history** and statistics
3. **Custom point values** for different wagers
4. **Time limits** for making choices
5. **Spectator mode** for watching wagers

### Code Structure
The current implementation is designed to be easily extensible:
- Wager actions are processed in `processGameAction()`
- State is managed separately from main game state
- Events follow a consistent pattern
- UI components are modular and reusable

## Testing

### Manual Testing
1. Create a game as host
2. Start the game
3. Propose a wager
4. Join as another player (different browser/incognito)
5. Make choices
6. Resolve the wager
7. Verify points are awarded

### Automated Testing
- Server-side logic can be tested with unit tests
- Socket events can be tested with integration tests
- UI components can be tested with React testing library

## Security Considerations

### Current Implementation
- Only hosts can propose and resolve wagers
- Player choices are validated (0 or 1 only)
- Points are awarded server-side
- No client-side manipulation possible

### Future Considerations
- Rate limiting for wager proposals
- Validation of wager content
- Anti-cheat measures for point manipulation
- User authentication and authorization

## Performance Notes

### Current Optimizations
- The contest lives inside the game state (in memory, written through to Postgres)
- One full-state broadcast per change
- Minimal state updates
- Responsive UI with real-time feedback

### Scalability Considerations
- Wager states are stored per game
- Memory usage scales with active games
- Socket connections are managed efficiently
- API endpoints are lightweight

This wager system transforms the placeholder game into an engaging, interactive experience that encourages player participation and creates real competition through point-based rewards.
