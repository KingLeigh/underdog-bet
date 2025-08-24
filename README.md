# Underdog Bet

A real-time multiplayer betting game built with Node.js, Socket.IO, and React.

## Features

- **Real-time multiplayer gaming** using Socket.IO
- **Game lobby system** for creating and joining games
- **Player reconnection** support with 5-minute timeout
- **Wager System** - Hosts can propose wagers and players can bet on outcomes

## Wager System

The game now includes a complete wager system where:

1. **Host proposes a wager** by entering two free-text options
2. **Players make choices** between the two options and wager points
3. **Host resolves the wager** by indicating which choice was correct
4. **Points are awarded** - Players gain their wagered points if correct, lose them if incorrect

### Wager Rules:
- **Maximum wager**: 50 points OR current points, whichever is larger
  - Player with 25 points: can bet up to 50 points
  - Player with 100 points: can bet up to 100 points
  - Player with 0 points: can bet up to 50 points
- **Always playable**: Players can always bet up to their maximum allowed amount, even if they have fewer points (scores can go negative)
- **Point calculation**: Correct players gain their wagered amount, incorrect players lose their wagered amount

### How to use the Wager System:

1. **Start a game** as the host
2. **Propose a Wager** by entering two options (e.g., "Team A wins" vs "Team B wins")
3. **Players choose** which option they think is correct
4. **Host resolves** by selecting the correct answer
5. **Points are automatically awarded** to players who chose correctly

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository
2. Install server dependencies:
   ```bash
   cd server
   npm install
   ```

3. Install client dependencies:
   ```bash
   cd client
   npm install
   ```

### Running the Application

1. **Start the server:**
   ```bash
   cd server
   npm start
   ```
   Server runs on port 3001

2. **Start the client:**
   ```bash
   cd client
   npm run dev
   ```
   Client runs on port 5173

3. **Open your browser** and navigate to `http://localhost:5173`

## Game Flow

1. **Create or Join a Game** from the home page
2. **Wait in the lobby** for other players to join
3. **Start the game** when ready (minimum 2 players)
4. **Use the wager system** to create betting opportunities
5. **Track points** as players make correct predictions (scores can go negative)

## API Endpoints

- `GET /api/games` - List all active games
- `GET /api/games/:id` - Get specific game details
- `GET /api/games/:id/points` - Get player points for a game
- `GET /api/games/:id/wager` - Get current wager state
- `GET /api/debug/games/:id` - Debug endpoint with full game state

## Socket.IO Events

### Client to Server:
- `createGame` - Create a new game
- `joinGame` - Join an existing game
- `gameAction` - Perform game actions including:
  - `proposeWager` - Host proposes a new wager
  - `makeChoice` - Player makes a choice on current wager
  - `resolveWager` - Host resolves the wager

### Server to Client:
- `gameCreated` - Game creation confirmation
- `gameJoined` - Game join confirmation
- `gameStateUpdate` - Game state updates
- `wagerProposed` - New wager available
- `choiceMade` - Player made a choice
- `wagerResolved` - Wager resolved with results

## Technologies Used

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** React, Vite
- **Styling:** CSS with modern design principles
- **Real-time Communication:** Socket.IO for live game updates

## Development

The application uses a modern development setup with:
- Hot reloading for both client and server
- Concurrent development servers
- Modern ES6+ JavaScript features
- Responsive design for mobile and desktop

## License

This project is open source and available under the MIT License.
