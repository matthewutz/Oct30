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

## Configuration

- Port: set `PORT` env var (defaults to 3000)
- Host: set `HOST` env var (defaults to `0.0.0.0`)

## Files

- `index.js`: Express server
- `public/index.html`: landing page
- `package.json`: metadata and start script
- `.gitignore`: common Node ignores
