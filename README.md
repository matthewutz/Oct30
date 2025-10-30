# Simple Node.js Server

A minimal Node.js HTTP server with no external dependencies.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

- Health check: `http://localhost:3000/health` returns `{ "status": "ok" }`.

## Configuration

- Port: set `PORT` env var (defaults to 3000)
- Host: set `HOST` env var (defaults to `0.0.0.0`)

## Files

- `index.js`: server implementation
- `package.json`: metadata and start script
- `.gitignore`: common Node ignores
