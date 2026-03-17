# AI Intelligence Hub

A personalized AI intelligence feed aggregator and analysis platform. Consolidates content from RSS feeds, Substacks, arXiv, AI lab blogs, and tracked X accounts into a single dashboard with LLM-powered relevance scoring, executive briefings, and feed health monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                   │
│  Dashboard │ Feed Items │ Analysis Panel │ Settings   │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────┴──────────────────────────────┐
│                  Backend (Express)                    │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Fetcher │  │  Scorer  │  │   Scheduler (cron) │  │
│  │  (RSS)  │  │ (Claude) │  │  auto-refresh/score│  │
│  └────┬────┘  └────┬─────┘  └────────────────────┘  │
│       │            │                                  │
│  ┌────┴────────────┴─────────────────────────────┐   │
│  │            SQLite Database                     │   │
│  │  feeds │ items │ suggestions │ analysis_cache  │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**Key design decisions:**
- **SQLite** for zero-config local use; swap to PostgreSQL for multi-user/cloud deployment
- **Express** backend is stateless except for the DB; horizontally scalable
- **Claude Sonnet** for relevance scoring and analysis; runs server-side to protect your API key
- **Cron scheduler** for automatic feed refresh and scoring
- **Vite proxy** in dev; static serving from Express in production

## Quick Start (Local Laptop)

### Prerequisites
- Node.js 18+ (recommend 22)
- npm

### Setup

```bash
# Clone or unzip the project
cd ai-intel-hub

# Install all dependencies
npm run setup

# Edit your configuration
nano backend/.env
# At minimum, set ANTHROPIC_API_KEY=sk-ant-...
# Customize RELEVANCE_CONTEXT to your role

# Start both frontend and backend in dev mode
npm run dev
```

The app will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001/api

On first launch, the backend will:
1. Load ~50 default feeds (arXiv, Substacks, AI lab blogs, X accounts)
2. Immediately fetch all RSS feeds
3. Score items using Claude (if API key configured)
4. Continue refreshing every 30 minutes

### Running Backend Only (headless)

```bash
cd backend
cp .env.example .env
# Edit .env with your API key
npm install
npm run dev
```

Then query the API directly:
```bash
curl http://localhost:3001/api/stats
curl http://localhost:3001/api/items?minRelevance=0.7&limit=20
curl -X POST http://localhost:3001/api/analyze -H 'Content-Type: application/json' -d '{"mode":"briefing"}'
```

## Deploy to Server / Cloud

### Option A: Docker (recommended)

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Build and run
docker compose up -d

# Access at http://your-server:3001
```

The Docker setup:
- Builds the frontend, serves it from Express
- Persists the SQLite database in a named volume
- Auto-restarts on failure

### Option B: Docker on cloud VM (AWS/GCP/Azure)

```bash
# On your VM:
git clone <your-repo> ai-intel-hub
cd ai-intel-hub

# Create .env for docker compose
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

docker compose up -d

# Optional: put behind nginx/caddy for HTTPS
```

### Option C: Platform deployment (Railway, Fly.io, Render)

The Dockerfile is compatible with most container platforms. Set environment variables through the platform's dashboard:
- `ANTHROPIC_API_KEY`
- `FEED_REFRESH_INTERVAL` (default: 30)
- `RELEVANCE_CONTEXT` (your role description)
- `NODE_ENV=production`

**Note:** For persistent storage on ephemeral platforms, switch to PostgreSQL (see "Scaling" below).

## Configuration

### Environment Variables (backend/.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | — | Claude API key for scoring and analysis |
| `PORT` | No | 3001 | Backend server port |
| `FEED_REFRESH_INTERVAL` | No | 30 | Minutes between auto-refresh |
| `RELEVANCE_CONTEXT` | No | Generic | Your role/focus areas for relevance scoring |
| `DB_PATH` | No | `./data/intel-hub.db` | SQLite database location |
| `NODE_ENV` | No | development | Set to `production` to serve frontend from Express |

*The app works without an API key but LLM scoring and analysis will be disabled.

### Customizing Your Relevance Context

The `RELEVANCE_CONTEXT` variable tells Claude who you are, so it can score items for your specific needs. Be specific:

```
RELEVANCE_CONTEXT=Senior technology executive at a Global Systemically Important Bank. Focus areas: agentic AI architecture and harness design, enterprise AI platform development, AI governance and risk management for banking, EU AI Act compliance (Aug 2026 deadline), sovereign AI and vendor risk, GPU infrastructure economics, quantum computing applications in financial services, verified banking DSL design.
```

## API Reference

### Feeds
- `GET /api/feeds` — list all feeds
- `POST /api/feeds` — add a feed `{id, name, url, type, category}`
- `PUT /api/feeds/:id` — update a feed
- `DELETE /api/feeds/:id` — remove a feed and its items

### Items
- `GET /api/items?category=&minRelevance=&search=&limit=&offset=&saved=` — filtered item list
- `POST /api/items/:id/read` — mark as read
- `POST /api/items/:id/save` — toggle saved `{saved: true|false}`
- `POST /api/items/:id/dismiss` — hide from feed

### Actions
- `POST /api/fetch` — refresh all RSS feeds now
- `POST /api/fetch/:feedId` — refresh a single feed
- `POST /api/score` — score all unscored items via Claude
- `POST /api/analyze` — generate analysis `{mode: "briefing"|"risks"|"gaps"|"what-so-what-now-what", category?}`

### Health
- `GET /api/health` — server health check
- `GET /api/health/feeds` — per-feed health metrics
- `POST /api/health/analyze` — LLM-powered feed health analysis with suggestions

### Stats
- `GET /api/stats` — dashboard statistics

## Feed Types

| Type | How it works | Auto-fetch |
|------|-------------|------------|
| `rss` | Standard RSS/Atom parsing | Yes, on schedule |
| `x-account` | Tracked in dashboard, manual or API-based | No (see below) |
| `scrape` | Future: page change detection | Planned |

### X/Twitter Integration

X accounts are currently tracked as bookmarks in the dashboard. For live tweet ingestion, you would need to:

1. Obtain X API access (Basic tier: $100/mo)
2. Add an X fetcher module to `backend/src/fetcher.js`
3. Use the `GET /2/users/:id/tweets` endpoint with your bearer token

Alternatively, some third-party services provide RSS-like feeds for X accounts (e.g., Nitter instances, rss.app, or similar). You can add these as regular RSS feeds.

## Scaling and Production Hardening

### Switch to PostgreSQL

For multi-user or cloud deployment, replace SQLite:

1. Install `pg` package: `npm install pg`
2. Replace `better-sqlite3` calls in `db.js` with `pg` equivalents
3. The schema is standard SQL and ports directly

### Add Authentication

For exposed deployments, add authentication middleware:

```javascript
// Simple API key auth
app.use('/api', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== process.env.APP_API_KEY) return res.status(401).json({error: 'Unauthorized'});
  next();
});
```

Or integrate with your SSO/OAuth provider.

### Rate Limiting

Add `express-rate-limit` to prevent abuse:

```bash
npm install express-rate-limit
```

## Extending

### Add a new feed source type

1. Create a fetcher function in `backend/src/fetcher.js` following the `fetchRSSFeed` pattern
2. Return `{items: [...], error: null}` with the standard item shape
3. Register it in `fetchAllFeeds()` with a type check

### Add a new analysis mode

1. Add a prompt template in `backend/src/scorer.js` under the `prompts` object in `generateAnalysis()`
2. The frontend will need a corresponding button in the Analysis Panel

### Custom tag patterns

Edit the `tagPatterns` object in `backend/src/fetcher.js` to detect domain-specific topics.

## License

Private / internal use.
