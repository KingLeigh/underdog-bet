# Underdog Bet - Multiplayer Board Game

A real-time multiplayer board game built with Node.js, Socket.io, and React. Players can create game sessions, join with friends, and play together with synchronized game state across all devices.

## 🚀 Features

- **Real-time Game Sessions**: Create and join games with unique 6-character IDs
- **Live Player Synchronization**: All players see the same game state in real-time
- **Responsive Design**: Works on desktop and mobile devices
- **No Database Required**: In-memory game state management
- **Modern UI**: Beautiful glassmorphism design with smooth animations

## 🏗️ Architecture

```
underdog_bet/
├── server/                 # Node.js + Socket.io server
│   ├── index.js           # Main server file
│   └── package.json       # Server dependencies
├── client/                 # React + Vite client app
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # Game state management
│   │   └── main.jsx       # App entry point
│   ├── package.json       # Client dependencies
│   └── vite.config.js     # Vite configuration
└── package.json            # Root package.json with scripts
```

## 🛠️ Tech Stack

### Server
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **Socket.io** - Real-time communication
- **CORS** - Cross-origin resource sharing
- **Helmet** - Security middleware

### Client
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Socket.io-client** - Client-side socket connection
- **React Router** - Client-side routing

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd underdog_bet
   ```

2. **Install all dependencies**
   ```bash
   npm run install:all
   ```

3. **Start development servers**
   ```bash
   npm run dev
   ```

This will start both the server (port 3001) and client (port 5173) in development mode.

### Manual Setup

If you prefer to run servers separately:

**Server:**
```bash
cd server
npm install
npm run dev
```

**Client:**
```bash
cd client
npm install
npm run dev
```

## 🎮 How to Play

1. **Create a Game**: Click "Create New Game" and configure player limits
2. **Share Game ID**: Copy the 6-character game ID and share it with friends
3. **Join Game**: Players enter the game ID to join the session
4. **Start Playing**: Host starts the game when ready
5. **Real-time Action**: All players see synchronized game state

## 🔧 Development

### Available Scripts

- `npm run dev` - Start both server and client in development mode
- `npm run server:dev` - Start only the server
- `npm run client:dev` - Start only the client
- `npm run server:start` - Start server in production mode
- `npm run client:build` - Build client for production

### Project Structure

#### Server (`/server`)
- **Game Session Management**: Create, join, and manage game rooms
- **Socket.io Events**: Handle real-time player connections and actions
- **Game State**: Maintain synchronized game state across all players
- **API Endpoints**: REST endpoints for game information

#### Client (`/client`)
- **Home Page**: Create or join games
- **Game Lobby**: Wait for players and start game
- **Game Board**: Main game interface (placeholder for now)
- **Real-time Updates**: Live synchronization with server

### Adding Game Logic

The current implementation includes:
- Basic game session management
- Player connection handling
- Real-time state synchronization
- Placeholder for game actions

To add your specific board game:
1. Extend the `processGameAction` function in `server/index.js`
2. Add game-specific state properties to the game object
3. Create game board components in the client
4. Implement game rules and validation

## 🌐 Deployment

### Environment Variables

Create `.env` files in both server and client directories:

**Server (.env)**
```env
PORT=3001
CLIENT_URL=http://localhost:5173
```

**Client (.env)**
```env
VITE_SERVER_URL=http://localhost:3001
```

### Production Build

1. **Build the client**
   ```bash
   npm run client:build
   ```

2. **Start the server**
   ```bash
   npm run server:start
   ```

3. **Serve static files**: The server can serve the built client files

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🐛 Known Issues

- Game state is not persisted (in-memory only)
- No authentication system
- Basic error handling

## 🔮 Future Enhancements

- [ ] Database persistence for game state
- [ ] User authentication and profiles
- [ ] Game history and statistics
- [ ] Spectator mode
- [ ] Mobile app versions
- [ ] Advanced game features

## 📞 Support

For questions or issues, please open a GitHub issue or contact the development team.
