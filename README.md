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
