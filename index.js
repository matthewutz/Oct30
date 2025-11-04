const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET','POST'], credentials: false },
  pingInterval: 25000,
  pingTimeout: 20000
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static assets from ./public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// --- Browser Battle state ---
const players = new Map(); // socketId -> { name, color }
let currentController = null; // socketId of person in control
let currentUrl = 'https://duckduckgo.com'; // default starting URL (allows iframe embedding)

// Cache for URL validation
const urlCache = new Map();

// Generate random color for player
function getRandomColor() {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe', '#00b894', '#00cec9'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Validate and normalize URL
function validateUrl(url) {
  if (urlCache.has(url)) {
    return urlCache.get(url);
  }
  
  let validatedUrl = String(url || '').trim();
  if (!validatedUrl.startsWith('http://') && !validatedUrl.startsWith('https://')) {
    validatedUrl = 'https://' + validatedUrl;
  }
  
  try {
    new URL(validatedUrl); // Validate URL format
    urlCache.set(url, validatedUrl);
    return validatedUrl;
  } catch (e) {
    return null;
  }
}

io.on('connection', (socket) => {
  const playerName = `Player ${socket.id.slice(0, 6)}`;
  const playerColor = getRandomColor();
  players.set(socket.id, { name: playerName, color: playerColor });

  // Send current state to new client (optimized serialization)
  const playersArray = [];
  for (const [id, data] of players) {
    playersArray.push({ id, name: data.name, color: data.color });
  }
  socket.emit('state', {
    players: playersArray,
    currentController: currentController,
    currentUrl: currentUrl
  });

  // Notify others about the new player
  socket.broadcast.emit('playerJoined', { id: socket.id, name: playerName, color: playerColor });

  // Attempt to take control
  socket.on('takeControl', () => {
    const oldController = currentController;
    currentController = socket.id;
    
    io.emit('controlChanged', { 
      newController: socket.id,
      oldController: oldController,
      controllerName: playerName
    });
    
    // If old controller disconnected, don't notify them
    if (oldController && players.has(oldController)) {
      io.to(oldController).emit('controlLost');
    }
  });

  // Navigation events (only from current controller)
  socket.on('navigate', ({ url }) => {
    if (currentController !== socket.id) {
      return; // Silently ignore if not controller
    }
    
    const validatedUrl = validateUrl(url);
    if (!validatedUrl) {
      socket.emit('error', { message: 'Invalid URL' });
      return;
    }
    
    if (currentUrl !== validatedUrl) {
      currentUrl = validatedUrl;
      io.emit('urlChanged', { url: currentUrl, controller: socket.id, controllerName: playerName });
    }
  });

  // Iframe navigation events (when controller navigates inside iframe)
  socket.on('iframeNavigate', ({ url }) => {
    if (currentController !== socket.id || currentUrl === url) {
      return; // Ignore if not controller or same URL
    }
    
    currentUrl = url;
    io.emit('urlChanged', { url: currentUrl, controller: socket.id, controllerName: playerName });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', { id: socket.id });
    
    // If controller disconnects, clear control
    if (currentController === socket.id) {
      currentController = null;
      io.emit('controlChanged', { 
        newController: null,
        oldController: socket.id,
        controllerName: null
      });
    }
  });
});


server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

