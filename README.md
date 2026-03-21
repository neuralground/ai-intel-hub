# AI Intelligence Hub

A personalized AI intelligence source aggregator and analysis platform. Consolidates content from RSS sources, Substacks, arXiv, AI lab blogs, and tracked X accounts into a single dashboard with LLM-powered relevance scoring, semantic deduplication, daily summaries, and source health monitoring. Supports dual LLM model configuration — use a fast model for scoring and a more capable one for analysis.

For a detailed walkthrough of every feature, see the [User Guide](USER_GUIDE.md).

## How to Run

Choose the mode that fits your use case:

| Mode | Best For | Prerequisites | Install Time |
|------|----------|---------------|-------------|
| [**Desktop App**](#desktop-app-electron) | Personal use on Mac/Windows — double-click and go | Pre-built installer | 1 minute |
| [**Client-Server (dev)**](#client-server-development) | Development, customization, contributing | Node.js 18+ | 5 minutes |
| [**Client-Server (production)**](#client-server-production) | Shared access, always-on server, headless | Node.js 18+ or Docker | 5 minutes |
| [**Docker**](#docker) | Server deployment, CI/CD, cloud VMs | Docker | 2 minutes |

All four modes run the same codebase and share the same features. The only differences are how the app is started, where data is stored, and how settings are configured.

---

## Desktop App (Electron)

The simplest way to use AI Intelligence Hub. A native macOS or Windows application — no terminal, no browser, no Docker.

### Install from Pre-built Package

Download the latest release for your platform:

| Platform | File | Notes |
|----------|------|-------|
| macOS (Intel + Apple Silicon) | `AI Intelligence Hub-x.x.x-universal.dmg` | Drag to Applications |
| Windows | `AI Intelligence Hub Setup x.x.x.exe` | NSIS installer with options |
| Windows (portable) | `AI Intelligence Hub x.x.x.exe` | No install needed, runs directly |

Open the DMG or run the installer. The app launches immediately with ~50 pre-configured AI sources.

### First Launch

1. Open the app
2. Sources begin loading automatically
3. Open **Settings** (gear icon in the header bar, or Cmd+, on macOS) to configure:
   - **Anthropic API key** — required for relevance scoring and analysis
   - **Your Role** — describe who you are so the LLM can score items for your needs
   - **Scoring Instructions** — additional prioritization and filtering guidance
4. Optionally connect third-party services (X/Twitter, Substack, LinkedIn, Threads, YouTube) via the **Connected Services** section in Settings. In the desktop app, clicking "Sign in" opens a browser login window — no API keys or developer accounts needed.

### Desktop Data and Settings

| What | Location (macOS) | Location (Windows) |
|------|-------------------|---------------------|
| Database | `~/Library/Application Support/AI Intelligence Hub/data/db.json` | `%APPDATA%\AI Intelligence Hub\data\db.json` |
| Settings | `~/Library/Application Support/AI Intelligence Hub/settings.json` | `%APPDATA%\AI Intelligence Hub\settings.json` |

The settings file stores your configuration as JSON:

```json
{
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "RELEVANCE_CONTEXT": "Your role and focus areas...",
  "SCORING_INSTRUCTIONS": "Prioritize agentic AI developments...",
  "LLM_ANALYSIS_PROVIDER": "anthropic",
  "LLM_ANALYSIS_MODEL": "claude-sonnet-4-20250514",
  "FEED_REFRESH_INTERVAL": "30",
  "TWITTER_SESSION": "...",
  "SUBSTACK_SESSION": "...",
  "LINKEDIN_SESSION": "...",
  "THREADS_SESSION": "...",
  "YOUTUBE_SESSION": "..."
}
```

You can edit this file directly, or use the in-app Settings panel.

### Building the Desktop App from Source

If you want to build the installer yourself:

```bash
git clone <your-repo> ai-intel-hub && cd ai-intel-hub

# Install all dependencies
npm install && npm run install:all

# Generate app icons (macOS: requires librsvg — brew install librsvg)
npm run electron:icons

# Build for your platform
npm run electron:build:mac    # → dist-electron/*.dmg
npm run electron:build:win    # → dist-electron/*.exe
```

For code signing, notarization, CI/CD pipelines, and distribution details, see [ELECTRON.md](ELECTRON.md).

---

## Client-Server (Development)

Run the Express backend and React frontend as separate processes with hot-reload.

### Prerequisites

- **Node.js** 18+ (22 LTS recommended)
- **npm** 9+

### Setup

```bash
git clone <your-repo> ai-intel-hub && cd ai-intel-hub

# Install dependencies and create .env from template
npm run setup

# Configure your API key and relevance context
nano backend/.env

# Start both backend and frontend in dev mode
npm run dev
```

The app is available at:
- **Frontend (with HMR):** http://localhost:5173
- **Backend API:** http://localhost:3001/api

Backend changes auto-reload via `node --watch`. Frontend changes hot-reload via Vite HMR.

### Running Backend Only (headless)

```bash
cd backend
cp .env.example .env
# Edit .env with your settings
npm install
npm run dev
```

Then interact via the API directly:

```bash
curl http://localhost:3001/api/stats
curl http://localhost:3001/api/items?minRelevance=0.7&limit=20
curl -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"mode":"briefing"}'
```

---

## Client-Server (Production)

Build the frontend and serve everything from Express on a single port.

```bash
# Build frontend assets
npm run build

# Start production server
npm start
# → http://localhost:3001 (frontend + API on same port)
```

Data is stored in `backend/data/db.json`. Configuration is read from `backend/.env`.

---

## Docker

One-command deployment with persistent storage. Recommended for servers and cloud VMs.

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Optional: customize relevance context
export RELEVANCE_CONTEXT="Your role description..."

# Build and start
docker compose up -d

# Access at http://localhost:3001
```

The Docker setup:
- Multi-stage build: compiles frontend, serves from Express
- Persists data in a named Docker volume (`intel-hub-data`)
- Auto-restarts on failure

### Cloud VM (AWS/GCP/Azure)

```bash
git clone <your-repo> ai-intel-hub && cd ai-intel-hub
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
docker compose up -d
```

For HTTPS, put behind nginx or Caddy.

### Container Platforms (Railway, Fly.io, Render)

The Dockerfile is compatible with most container platforms. Set environment variables through the platform dashboard:
- `ANTHROPIC_API_KEY`
- `RELEVANCE_CONTEXT`
- `FEED_REFRESH_INTERVAL` (default: 30)
- `NODE_ENV=production`

---

## Configuration Reference

### Environment Variables (Client-Server and Docker)

Configure via `backend/.env` (client-server) or as environment variables (Docker/cloud).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | For LLM features | — | Anthropic API key (`sk-ant-...`) for relevance scoring and analysis |
| `PORT` | No | `3001` | Backend server port |
| `FEED_REFRESH_INTERVAL` | No | `30` | Minutes between automatic feed refresh cycles |
| `RELEVANCE_CONTEXT` | Recommended | Generic | Your role and focus areas — controls all LLM scoring and analysis |
| `DATA_DIR` | No | `./data/` | Directory for persistent data (`db.json`) |
| `NODE_ENV` | No | `development` | Set to `production` to serve frontend from Express |
| `LLM_PROVIDER` | No | `anthropic` | LLM provider (anthropic, openai, gemini, ollama) |
| `LLM_MODEL` | No | Provider default | Model to use for scoring (and analysis, if no analysis-specific override) |
| `LLM_ANALYSIS_PROVIDER` | No | Same as `LLM_PROVIDER` | Separate LLM provider for analysis/summaries (anthropic, openai, gemini, ollama) |
| `LLM_ANALYSIS_MODEL` | No | Same as `LLM_MODEL` | Separate model for analysis/summaries (e.g. use a more capable model than scoring) |
| `OPENAI_API_KEY` | For OpenAI | — | OpenAI API key |
| `GEMINI_API_KEY` | For Gemini | — | Google Gemini API key |
| `OLLAMA_BASE_URL` | For Ollama | `http://localhost:11434` | Ollama server endpoint |

The app works without an API key, but LLM-powered features (relevance scoring, daily summaries, source health analysis) will be disabled. Sources will still fetch and display with a default relevance of 0.5.

### Desktop App Settings

The desktop app stores configuration in `settings.json` (see [Desktop Data and Settings](#desktop-data-and-settings)) instead of environment variables. The settings map directly:

| settings.json key | Equivalent env var | Description |
|--------------------|--------------------|-------------|
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | Anthropic API key |
| `RELEVANCE_CONTEXT` | `RELEVANCE_CONTEXT` | Your role and focus areas |
| `SCORING_INSTRUCTIONS` | `SCORING_INSTRUCTIONS` | Additional prioritization/filtering guidance |
| `FEED_REFRESH_INTERVAL` | `FEED_REFRESH_INTERVAL` | Refresh interval in minutes |
| `TWITTER_SESSION` | `TWITTER_SESSION` | X/Twitter session (set via browser login) |
| `SUBSTACK_SESSION` | `SUBSTACK_SESSION` | Substack session (set via browser login) |
| `LINKEDIN_SESSION` | `LINKEDIN_SESSION` | LinkedIn session (set via browser login) |
| `THREADS_SESSION` | `THREADS_SESSION` | Threads session (set via browser login) |
| `YOUTUBE_SESSION` | `YOUTUBE_SESSION` | YouTube session (set via browser login) |
| `LLM_PROVIDER` | `LLM_PROVIDER` | LLM provider: anthropic, openai, gemini, or ollama |
| `LLM_MODEL` | `LLM_MODEL` | Model name (provider-specific) |
| `LLM_ANALYSIS_PROVIDER` | `LLM_ANALYSIS_PROVIDER` | Separate provider for analysis (defaults to scoring provider) |
| `LLM_ANALYSIS_MODEL` | `LLM_ANALYSIS_MODEL` | Separate model for analysis (defaults to scoring model) |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | `GEMINI_API_KEY` | Google Gemini API key |
| `OLLAMA_BASE_URL` | `OLLAMA_BASE_URL` | Ollama server URL (default: http://localhost:11434) |

Settings can be updated three ways:
1. **Settings panel:** click the gear icon in the header (or Cmd+, / Ctrl+,)
2. **Edit the file:** Open `settings.json` in any text editor
3. **API:** `POST /api/settings` with JSON body (see [API Reference](#api-reference))

### Configuring Relevance Context

The `RELEVANCE_CONTEXT` setting is the most impactful configuration. It tells Claude who you are, so it can score items for your specific needs. Be specific about your role, responsibilities, and focus areas:

```
Senior technology executive at a Global Systemically Important Bank.
Focus areas: agentic AI architecture and harness design, enterprise AI
platform development, AI governance and risk management for banking,
EU AI Act compliance (Aug 2026 deadline), sovereign AI and vendor risk,
GPU infrastructure economics, quantum computing applications in
financial services, verified banking DSL design.
```

This context is injected into every LLM prompt — for relevance scoring, daily summaries, risk analysis, and feed health suggestions. A vague context produces vague scoring; a specific context produces actionable intelligence.

---

## What Happens on First Launch

Regardless of which mode you choose, the app does the same thing on startup:

1. **Loads ~50 default sources** across 6 categories (research, engineering, industry, policy, labs, news) including arXiv, Anthropic/OpenAI/DeepMind blogs, key Substacks, and industry publications
2. **Fetches all RSS sources** immediately (takes 10-30 seconds depending on network)
3. **Scores items via the configured LLM** if an API key is set (batches of 15, takes 1-2 minutes for initial scoring). The LLM provider is configurable -- Anthropic (default), OpenAI, Google Gemini, or Ollama for local models. See [Settings](USER_GUIDE.md#settings) in the User Guide.
4. **Starts the refresh scheduler** — sources are re-fetched and new items scored every 30 minutes (configurable)
5. **Runs daily cleanup** at 3 AM, removing items older than 30 days (saved items are preserved)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│       Frontend (React 18 / Vite)                    │
│  Dashboard  │  Feed Items  │  Analysis  │  Sources  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (/api/*)
┌──────────────────────┴──────────────────────────────┐
│       Backend (Express.js)                          │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Fetcher  │  │  Scorer  │  │ Scheduler (cron) │  │
│  │ (RSS)    │  │ (Claude) │  │ refresh + score  │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘  │
│       │              │                               │
│  ┌────┴──────────────┴─────────────────────────┐    │
│  │  Persistence (db.js → data/db.json)         │    │
│  │  feeds │ items │ suggestions │ analysisCache │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

In **desktop mode**, the Express backend runs inside the Electron main process, the React frontend loads in a BrowserWindow, and data is stored in the OS application data directory instead of `backend/data/`.

In **client-server mode**, Express runs standalone, Vite proxies `/api` in development, and Express serves the built frontend in production.

**Key design decisions:**
- **JSON file persistence** — zero native dependencies; trivially swappable for SQLite or PostgreSQL
- **Server-side LLM calls** — API key stays in the backend; enables caching and batch scoring
- **Relevance scoring as a separate pass** — items ingest at 0.5, async scoring decouples from fetching
- **Same codebase for server and desktop** — `createServer(port)` is called by both standalone Node.js and Electron

For the full architecture guide, data model, and development roadmap, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## API Reference

All endpoints are available in every mode (client-server, Docker, and desktop). In desktop mode, the server runs on a dynamic port; use the app's built-in UI instead of curl.

### Feeds
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/feeds` | List all feeds |
| `POST` | `/api/feeds` | Add a feed `{name, url, type, category}` |
| `PUT` | `/api/feeds/:id` | Update a feed |
| `DELETE` | `/api/feeds/:id` | Remove a feed and all its items |

### Items
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/items?category=&minRelevance=&search=&limit=&offset=&saved=&orgs=&maxAgeDays=` | Filtered item list (use `orgs` to filter by organization affiliation, `maxAgeDays` to limit by recency) |
| `POST` | `/api/items/:id/read` | Mark as read |
| `POST` | `/api/items/:id/save` | Toggle saved `{saved: true\|false}` |
| `POST` | `/api/items/:id/dismiss` | Soft-delete from feed |

### Actions
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/fetch` | Refresh all RSS feeds now |
| `POST` | `/api/fetch/:feedId` | Refresh a single feed |
| `POST` | `/api/score` | Score all unscored items via Claude |
| `POST` | `/api/analyze` | Generate analysis `{mode, category?}` |

Analysis modes: `briefing` (Daily Summary), `risks` (Risk Scan), `gaps` (Coverage Gaps), `what-so-what-now-what` (WSNW)

### Health and Stats
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/health/feeds` | Per-feed health metrics |
| `POST` | `/api/health/analyze` | LLM feed health analysis with suggestions |
| `GET` | `/api/stats` | Dashboard statistics |

### Suggestions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/suggestions` | List pending feed suggestions |
| `POST` | `/api/suggestions/:id/accept` | Accept a suggestion (creates feed) |
| `POST` | `/api/suggestions/:id/dismiss` | Dismiss a suggestion |

### Organizations
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/orgs` | List recognized organizations for affiliation tagging |
| `POST` | `/api/orgs` | Add a custom organization `{id, label, type, aliases}` |
| `DELETE` | `/api/orgs/:id` | Remove a user-added organization |
| `GET` | `/api/orgs/affiliations` | Distinct affiliations with item counts |
| `GET` | `/api/ollama/models` | List locally available Ollama models |

### Services
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/services/check` | Check connectivity of all configured service sessions |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/cleanup` | Clear old items `{days}` (0 = all non-saved) |
| `POST` | `/api/admin/rescore` | Reset scores and re-run LLM scoring |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Read current settings (secrets masked) |
| `POST` | `/api/settings` | Update settings (any combination of keys below) |

Accepted keys for `POST /api/settings`: `ANTHROPIC_API_KEY`, `RELEVANCE_CONTEXT`, `SCORING_INSTRUCTIONS`, `FEED_REFRESH_INTERVAL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_ANALYSIS_PROVIDER`, `LLM_ANALYSIS_MODEL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_BASE_URL`, `TWITTER_SESSION`, `SUBSTACK_SESSION`, `LINKEDIN_SESSION`, `THREADS_SESSION`, `YOUTUBE_SESSION`

---

## Feed Categories

| Category | Key | Content |
|----------|-----|---------|
| AI Research | `research` | arXiv (cs.AI, cs.LG, cs.CL, cs.CR), research blogs, technical Substacks |
| Engineering & Practice | `engineering` | Builder blogs, tool evaluations, production patterns |
| Industry & Capital | `industry` | VC analysis, startup news, enterprise adoption |
| Policy & Governance | `policy` | Regulation, safety, ethics, geopolitics |
| AI Labs | `labs` | Official blogs from OpenAI, Anthropic, DeepMind, Meta AI, xAI |
| AI News & Announcements | `news` | AI-focused news from major tech publications, newsletters, and curated X accounts |

Feeds can be added, removed, muted, or reorganized from the Sources panel in the UI, or via the API.

---

## Makefile Targets

For convenience, common operations are available via `make`:

```
  setup              Install all dependencies and create .env
  dev                Start dev mode (Vite HMR + Express backend)
  build              Build frontend for production
  start              Start production server
  docker-build       Build Docker image
  docker-up          Start with Docker Compose
  docker-down        Stop Docker containers
  electron-dev       Run Electron in dev mode
  electron-start     Build and launch Electron app locally
  icons              Generate app icons
  electron-mac       Build macOS installer (.dmg)
  electron-win       Build Windows installer (.exe)
  electron-all       Build installers for all platforms
  clean              Remove build artifacts
```

---

## Troubleshooting

### Sources not loading

- Check internet connectivity — the app requires network access to fetch RSS sources
- Look at the Sources panel for per-feed error messages (red indicators)
- Check the terminal/console for `[Fetcher]` error messages

### LLM features not working

- Verify your API key is set: check `backend/.env` (server) or Settings (desktop)
- The key must start with `sk-ant-` and not be the placeholder `sk-ant-your-key-here`
- Check for `[Scorer]` error messages in the console

### Desktop app won't start

- **macOS:** If you see "app is damaged", the app may need to be unsigned-allowed: `xattr -cr "/Applications/AI Intelligence Hub.app"`
- **Windows:** SmartScreen warnings appear for unsigned apps — click "More info" > "Run anyway"
- Open DevTools (Cmd+Option+I / Ctrl+Shift+I) to check for errors

### Port already in use

```bash
# Find what's using port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
```

The desktop app uses a random available port, so this only affects client-server mode.

---

## Extending

### Add a new feed source type

1. Create a fetcher function in `backend/src/fetcher.js` following the `fetchRSSFeed` pattern
2. Return `{items: [...], error: null}` with the standard item shape
3. Register it in `fetchAllFeeds()` with a type check

### Add a new analysis mode

1. Add a prompt template in `backend/src/scorer.js` under the `prompts` object in `generateAnalysis()`
2. Add a button for it in the Analysis Panel in `frontend/src/App.jsx`

### Custom tag patterns

Edit the `tagPatterns` object in `backend/src/fetcher.js` to detect domain-specific topics.

---

## Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Run all tests from project root
npm test
```

---

## License

Private / internal use.
