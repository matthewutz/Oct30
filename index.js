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
const players = new Map(); // socketId -> { x, y, animal, chips }
const world = { width: 2000, height: 1200 };
const speed = 240; // pixels per second

// --- Casino state ---
// Minimal single roulette and single blackjack table
const roulette = {
  id: 'roulette-1',
  x: 600, y: 400,
  bets: [], // { id, playerId, number, amount }
  lastResult: null,
  nextSpinAt: Date.now() + 20000,
  spinIntervalMs: 20000
};

// Blackjack helpers
function createShoe() {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (let d = 0; d < 4; d++) {
    for (const r of ranks) for (const s of suits) deck.push(r + s);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function cardValue(r) {
  if (r === 'A') return 11;
  if (['K','Q','J','10'].includes(r)) return 10;
  return Number(r);
}
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = c.replace(/[♠♥♦♣]/g, '');
    total += cardValue(r);
    if (r === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const blackjack = {
  id: 'blackjack-1',
  x: 1200, y: 500,
  shoe: createShoe(),
  dealer: [],
  players: new Map(), // playerId -> { bet, hand, stood, busted, finished }
  roundActive: false
};

function dealCard(shoe) {
  if (shoe.length < 10) {
    const s2 = createShoe();
    shoe.push(...s2);
  }
  return shoe.pop();
}

io.on('connection', (socket) => {
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const spawn = {
    x: Math.floor(Math.random() * world.width),
    y: Math.floor(Math.random() * world.height),
    animal,
    chips: 10000
  };
  players.set(socket.id, spawn);

  // Send the current state to the new client
  socket.emit('state', Object.fromEntries(players));
  socket.emit('tablesState', {
    roulette: {
      id: roulette.id,
      x: roulette.x, y: roulette.y,
      bets: roulette.bets,
      lastResult: roulette.lastResult,
      nextSpinAt: roulette.nextSpinAt
    },
    blackjack: {
      id: blackjack.id,
      x: blackjack.x, y: blackjack.y,
      dealer: blackjack.dealer,
      players: Array.from(blackjack.players, ([id, data]) => ({ id, bet: data.bet, hand: data.hand, stood: data.stood, busted: data.busted, finished: data.finished })),
      roundActive: blackjack.roundActive
    }
  });
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
    // Remove player from blackjack table if present
    if (blackjack.players.has(socket.id)) {
      blackjack.players.delete(socket.id);
      io.emit('blackjackUpdate', serializeBlackjack());
    }
  });

  // --- Roulette events ---
  socket.on('roulette:bet', (payload) => {
    const type = payload?.type || 'number';
    let amount = Math.max(1, Math.min(1000, Number(payload?.amount) || 0));
    // Deadline: stop accepting bets 2s before spin
    if (Date.now() > roulette.nextSpinAt - 2000) return;
    const me = players.get(socket.id);
    if (!me) return;
    const near = Math.hypot(me.x - roulette.x, me.y - roulette.y) < 150;
    if (!near) return;
    if (me.chips < amount) return;

    if (type === 'number') {
      const number = Number(payload?.number);
      if (!Number.isInteger(number) || number < 0 || number > 36) return;
      me.chips -= amount;
      roulette.bets.push({ id: `${socket.id}-${Date.now()}`, playerId: socket.id, type: 'number', number, amount });
    } else if (type === 'color') {
      const color = String(payload?.color || '').toLowerCase();
      if (!['red','black'].includes(color)) return;
      me.chips -= amount;
      roulette.bets.push({ id: `${socket.id}-${Date.now()}`, playerId: socket.id, type: 'color', color, amount });
    } else {
      return;
    }

    io.emit('rouletteUpdate', serializeRoulette());
    io.emit('chipsUpdate', { id: socket.id, chips: me.chips });
  });

  // --- Blackjack events ---
  socket.on('blackjack:bet', ({ amount }) => {
    amount = Math.max(1, Math.min(1000, Number(amount) || 0));
    if (blackjack.roundActive) return;
    const me = players.get(socket.id);
    if (!me) return;
    const near = Math.hypot(me.x - blackjack.x, me.y - blackjack.y) < 150;
    if (!near) return;
    if (me.chips < amount) return;
    me.chips -= amount;
    const p = blackjack.players.get(socket.id) || { bet: 0, hand: [], stood: false, busted: false, finished: false };
    p.bet = amount; p.hand = []; p.stood = false; p.busted = false; p.finished = false;
    blackjack.players.set(socket.id, p);
    io.emit('blackjackUpdate', serializeBlackjack());
    io.emit('chipsUpdate', { id: socket.id, chips: me.chips });
  });

  socket.on('blackjack:deal', () => {
    if (blackjack.roundActive) return;
    if (!blackjack.players.size) return;
    // Any player near table can start dealing
    const me = players.get(socket.id);
    if (!me) return;
    const near = Math.hypot(me.x - blackjack.x, me.y - blackjack.y) < 150;
    if (!near) return;
    blackjack.roundActive = true;
    blackjack.dealer = [dealCard(blackjack.shoe), dealCard(blackjack.shoe)];
    for (const [, p] of blackjack.players) {
      if (p.bet > 0) p.hand = [dealCard(blackjack.shoe), dealCard(blackjack.shoe)];
    }
    io.emit('blackjackUpdate', serializeBlackjack());
  });

  socket.on('blackjack:hit', () => {
    if (!blackjack.roundActive) return;
    const p = blackjack.players.get(socket.id);
    if (!p || p.stood || p.busted || p.finished) return;
    const me = players.get(socket.id);
    if (!me) return;
    const near = Math.hypot(me.x - blackjack.x, me.y - blackjack.y) < 150;
    if (!near) return;
    p.hand.push(dealCard(blackjack.shoe));
    if (handValue(p.hand) > 21) { p.busted = true; p.finished = true; }
    io.emit('blackjackUpdate', serializeBlackjack());
  });

  socket.on('blackjack:stand', () => {
    if (!blackjack.roundActive) return;
    const p = blackjack.players.get(socket.id);
    if (!p || p.stood || p.busted || p.finished) return;
    const me = players.get(socket.id);
    if (!me) return;
    const near = Math.hypot(me.x - blackjack.x, me.y - blackjack.y) < 150;
    if (!near) return;
    p.stood = true;
    p.finished = true;
    io.emit('blackjackUpdate', serializeBlackjack());
  });
});

function serializeRoulette() {
  return {
    id: roulette.id,
    x: roulette.x, y: roulette.y,
    bets: roulette.bets,
    lastResult: roulette.lastResult,
    nextSpinAt: roulette.nextSpinAt
  };
}

function serializeBlackjack() {
  return {
    id: blackjack.id,
    x: blackjack.x, y: blackjack.y,
    dealer: blackjack.dealer,
    players: Array.from(blackjack.players, ([id, data]) => ({ id, bet: data.bet, hand: data.hand, stood: data.stood, busted: data.busted, finished: data.finished })),
    roundActive: blackjack.roundActive
  };
}

// Roulette spin loop
setInterval(() => {
  const now = Date.now();
  if (now >= roulette.nextSpinAt) {
    const result = Math.floor(Math.random() * 37); // 0-36
    roulette.lastResult = result;
    const wins = [];
    for (const b of roulette.bets) {
      const pl = players.get(b.playerId);
      if (!pl) continue;
      if (b.type === 'number' && b.number === result) {
        const payout = b.amount * 36; // includes stake
        pl.chips += payout;
        wins.push({ playerId: b.playerId, amount: payout });
        io.emit('chipsUpdate', { id: b.playerId, chips: pl.chips });
      }
      if (b.type === 'color') {
        const redSet = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
        const resultColor = result === 0 ? 'green' : (redSet.has(result) ? 'red' : 'black');
        if (b.color === resultColor) {
          const payout = b.amount * 2; // even money includes stake
          pl.chips += payout;
          wins.push({ playerId: b.playerId, amount: payout });
          io.emit('chipsUpdate', { id: b.playerId, chips: pl.chips });
        }
      }
    }
    io.emit('rouletteSpin', { result, wins });
    roulette.bets = [];
    roulette.nextSpinAt = now + roulette.spinIntervalMs;
    io.emit('rouletteUpdate', serializeRoulette());
  }
}, 500);

// Blackjack round completion loop
setInterval(() => {
  if (!blackjack.roundActive) return;
  // If all players finished, resolve dealer and end round
  let allFinished = true;
  for (const [, p] of blackjack.players) {
    if (p.bet > 0 && !p.finished) { allFinished = false; break; }
  }
  if (!allFinished) return;
  // Dealer draws to 17+
  while (handValue(blackjack.dealer) < 17) {
    blackjack.dealer.push(dealCard(blackjack.shoe));
  }
  const dealerVal = handValue(blackjack.dealer);
  const results = [];
  for (const [id, p] of blackjack.players) {
    if (p.bet <= 0) continue;
    const pv = handValue(p.hand);
    let outcome = 'push';
    if (p.busted) outcome = 'lose';
    else if (dealerVal > 21) outcome = 'win';
    else if (pv > dealerVal) outcome = 'win';
    else if (pv < dealerVal) outcome = 'lose';
    results.push({ playerId: id, outcome });
    // payouts: bet deducted upfront; win -> +2x, push -> +1x, lose -> +0
    const pl = players.get(id);
    if (pl) {
      if (outcome === 'win') { pl.chips += p.bet * 2; }
      else if (outcome === 'push') { pl.chips += p.bet; }
      io.emit('chipsUpdate', { id, chips: pl.chips });
    }
  }
  io.emit('blackjackResolve', { dealer: blackjack.dealer, results });
  // Reset round but keep players list
  blackjack.roundActive = false;
  blackjack.dealer = [];
  for (const [, p] of blackjack.players) {
    p.hand = []; p.stood = false; p.busted = false; p.finished = false; p.bet = 0;
  }
  io.emit('blackjackUpdate', serializeBlackjack());
}, 500);

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

