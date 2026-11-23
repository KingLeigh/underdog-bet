require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { registerRoutes } = require('./lib/routes');
const { registerSocketHandlers } = require('./lib/sockets');
const persistence = require('./lib/persistence');

const app = express();
const server = http.createServer(app);

// Configure CORS based on environment
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? false // Same-origin only in production (client is served from this server)
    : process.env.CLIENT_URL || "http://localhost:5173",
  methods: ["GET", "POST"]
};

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from the React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

registerRoutes(app, io);
registerSocketHandlers(io);

// Serve React app for any non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;

// Connect to the database (when configured) and restore saved games before
// accepting connections. A failed init is loud but not fatal: the party can
// still run in-memory.
persistence
  .init()
  .catch(err => {
    console.error('Persistence init failed — continuing IN-MEMORY ONLY:', err.message);
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
