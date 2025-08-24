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

### Server Side (`server/index.js`)

#### New Data Structures
```javascript
// Wager state storage
const wagerStates = new Map(); // gameId -> wager state

// Each wager state contains:
{
  isActive: false,
  options: [],
  playerChoices: {},
  resolved: false,
  correctOption: null
}
```

#### New Game Actions
- `proposeWager` - Host creates a new wager
- `makeChoice` - Player selects an option
- `resolveWager` - Host indicates correct answer

#### New Socket Events
- `wagerProposed` - Broadcasts new wager to all players
- `choiceMade` - Notifies all players when someone chooses
- `wagerResolved` - Shows results and awards points

### Client Side

#### GameContext Updates
- Added wager state management
- New functions: `proposeWager`, `makeChoice`, `resolveWager`
- Real-time updates for wager events

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

### New Endpoints
- `GET /api/games/:id/wager` - Get current wager state
- Updated `GET /api/debug/games/:id` - Includes wager information

### Example Response
```json
{
  "gameId": "ABC123",
  "wagerState": {
    "isActive": true,
    "options": ["Team A wins", "Team B wins"],
    "playerChoices": {
      "player1": {"choice": 0, "playerName": "Alice"},
      "player2": {"choice": 1, "playerName": "Bob"}
    },
    "resolved": false,
    "correctOption": null
  }
}
```

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
- Use the debug endpoint: `GET /api/debug/games/:id`
- Check browser console for socket events
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
- In-memory storage for wager states
- Efficient socket event broadcasting
- Minimal state updates
- Responsive UI with real-time feedback

### Scalability Considerations
- Wager states are stored per game
- Memory usage scales with active games
- Socket connections are managed efficiently
- API endpoints are lightweight

This wager system transforms the placeholder game into an engaging, interactive experience that encourages player participation and creates real competition through point-based rewards.
