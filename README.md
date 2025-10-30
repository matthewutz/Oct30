# Simple Node.js Server (Express)

A minimal Express server that serves a static `public/index.html` and a health endpoint.

## Install

```bash
npm install
```

If dependencies are missing, run:

```bash
npm install express
```

## Run

```bash
npm start
```

Open `http://localhost:3000`.

- Health check: `http://localhost:3000/health` returns `{ "status": "ok" }`.

Open in multiple tabs to see other users moving in real time. Control with WASD.

## Casino features

- Roulette (green table at ~x600,y400)
  - Place a number bet (0-36) and wait for the periodic spin (~20s)
  - All players see each other’s bets and the result
- Blackjack (blue table at ~x1200,y500)
  - Place a bet when the round is idle, click Deal to start
  - During the round, each player can Hit/Stand; dealer resolves when all finished
  - State sync is server-authoritative; all players see shared dealer and hands

## Chips, proximity, and payouts

- Each player starts with $10,000 in chips.
- You must walk within ~150px of a table to place bets or act.
- Bets are deducted immediately when placed.
- Roulette payout: straight-up pays 35:1; stake is returned on win (implemented as 36x credit on win since stake was pre-deducted).
- Blackjack payout: even money (win returns 2x stake total, push returns stake).

## Deploying on Render (free tier)

- Make sure the Start Command is `npm start` and the port is set by Render (`PORT` env).
- Free instances can spin down; brief disconnects are normal. The client auto-reconnects.
- WebSockets are supported on Render; this app prefers WebSocket transport only.
- If you have a custom domain, set CORS origin if you lock it down (server uses `*` by default).

## Configuration

- Port: set `PORT` env var (defaults to 3000)
- Host: set `HOST` env var (defaults to `0.0.0.0`)

## Files

- `index.js`: Express server
- `public/index.html`: landing page
- `package.json`: metadata and start script
- `.gitignore`: common Node ignores
