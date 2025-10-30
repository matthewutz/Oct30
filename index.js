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

// --- Realtime multiplayer state ---
const animals = ['🦊','🐼','🐶','🐱','🦁','🐯','🐸','🐵','🐰','🐨','🐻','🐷','🐮','🐹','🦄','🐙'];
const players = new Map(); // socketId -> { x, y, animal }
const world = { width: 2000, height: 1200 };
const speed = 240; // pixels per second

io.on('connection', (socket) => {
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const spawn = {
    x: Math.floor(Math.random() * world.width),
    y: Math.floor(Math.random() * world.height),
    animal
  };
  players.set(socket.id, spawn);

  // Send the current state to the new client
  socket.emit('state', Object.fromEntries(players));
  // Notify others about the new player
  socket.broadcast.emit('playerJoined', { id: socket.id, ...spawn });

  // Movement input: { vx, vy, dt }
  socket.on('move', ({ vx, vy, dt }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const clampedVx = Math.max(-1, Math.min(1, Number(vx) || 0));
    const clampedVy = Math.max(-1, Math.min(1, Number(vy) || 0));
    const delta = Math.max(0, Math.min(0.1, Number(dt) || 0)); // cap dt to avoid jumps

    p.x += clampedVx * speed * delta;
    p.y += clampedVy * speed * delta;

    // clamp inside world bounds
    p.x = Math.max(0, Math.min(world.width, p.x));
    p.y = Math.max(0, Math.min(world.height, p.y));

    io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', { id: socket.id });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

