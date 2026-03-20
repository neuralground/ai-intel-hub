# AI Intelligence Hub — Architecture & Development Guide

## Purpose

This document describes the architecture, design decisions, data flows, and planned improvements for the AI Intelligence Hub. It is intended as the primary onboarding document for any developer or AI coding agent (e.g. Claude Code) working on this codebase.

The AI Intelligence Hub is a personalized feed aggregation and analysis platform for a senior technology executive at a GSIB (Global Systemically Important Bank). It consolidates AI-related content from RSS feeds, Substacks, arXiv, AI lab blogs, and tracked X/Twitter accounts into a single dashboard. An LLM layer (Claude via Anthropic API) provides relevance scoring, executive briefings, and feed health analysis personalized to the user's specific role and focus areas.

---

## System Architecture

The app runs in two modes from the same codebase:

- **Client-Server:** Express runs standalone; frontend served by Vite (dev) or Express (prod)
- **Desktop (Electron):** Express runs inside Electron's main process; React loads in a BrowserWindow

```
                         ┌─────────────────────────────┐
                         │  Browser / Electron Window   │
                         │  React SPA (Vite)            │
                         │  localhost:5173 (dev)         │
                         └──────────┬──────────────────┘
                                    │ HTTP (proxied in dev,
                                    │ served by Express in prod)
                         ┌──────────┴──────────────────┐
                         │     Express Backend          │
                         │     localhost:3001 (or auto)  │
                         │                              │
                         │  ┌────────────────────────┐  │
                         │  │     REST API Layer      │  │
                         │  │  /api/feeds             │  │
                         │  │  /api/items             │  │
                         │  │  /api/analyze           │  │
                         │  │  /api/score             │  │
                         │  │  /api/fetch             │  │
                         │  │  /api/health            │  │
                         │  │  /api/stats             │  │
                         │  │  /api/suggestions       │  │
                         │  └────────┬───────────────┘  │
                         │           │                   │
                         │  ┌────────┴───────────────┐  │
                         │  │   Service Layer          │  │
                         │  │                          │  │
                         │  │  fetcher.js ─── RSS     │  │
                         │  │    Parses RSS/Atom       │  │
                         │  │    Extracts tags          │  │
                         │  │    Batch concurrent       │  │
                         │  │                          │  │
                         │  │  scorer.js ─── LLM      │──┼──→ Anthropic / OpenAI /
                         │  │    Relevance scoring     │  │    Gemini / Ollama
                         │  │    Executive briefings   │  │
                         │  │    Feed health analysis  │  │
                         │  │    Coverage gap detection │  │
                         │  │                          │  │
                         │  │  node-cron ─── Scheduler │  │
                         │  │    Feed refresh (30m)    │  │
                         │  │    Auto-score new items  │  │
                         │  │    Daily cleanup         │  │
                         │  └────────┬───────────────┘  │
                         │           │                   │
                         │  ┌────────┴───────────────┐  │
                         │  │   Persistence Layer      │  │
                         │  │   db.js                  │  │
                         │  │   JSON file → data/db.json│ │
                         │  │   (swap to SQLite/PG)    │  │
                         │  └──────────────────────────┘  │
                         └────────────────────────────────┘
```

### Organization Registry (orgs.js)

A shared registry of 34 recognized organizations (AI labs, big tech companies, and top universities). The registry:

- Maps feed IDs to their owning organization (e.g., `openai-blog` maps to OpenAI) via `FEED_ORG_MAP`.
- Provides org names and aliases for LLM prompts, so the scorer can detect affiliations in research papers and blog posts.
- Is used by the scorer (affiliation detection during scoring), the fetcher (feed-level org tagging), and the db module (storing affiliations on items).
- Is served to the frontend via `GET /api/orgs` for badge rendering.

### Multi-Provider LLM (scorer.js)

The scoring and analysis engine supports four LLM providers:

- **Anthropic** (default) -- Claude Sonnet, Haiku, Opus.
- **OpenAI** -- GPT-4o, GPT-4o Mini, GPT-4 Turbo, o3-mini.
- **Google Gemini** -- Gemini 2.0 Flash, Gemini 2.5 Pro/Flash Preview.
- **Ollama** -- any locally installed model (models detected automatically via `GET /api/ollama/models`).

The active provider is selected via the `LLM_PROVIDER` setting. The specific model is set via `LLM_MODEL`. All providers are called through a unified interface in `scorer.js`; the rest of the codebase is provider-agnostic.

### Affiliation Detection

Organization affiliations are detected through a three-layer approach:

1. **Feed-level org tags** -- feeds from known organization sources (defined in `FEED_ORG_MAP` in `orgs.js`) automatically tag all their items with the org.
2. **LLM-based detection** -- during scoring, the LLM receives the list of recognized organizations and identifies any that authored or are affiliated with the content. This is integrated into the scoring prompt so it runs in the same API call as relevance scoring.
3. **Regex fallback** -- explicit affiliations in author strings (e.g., "University of Toronto", "Google Research") are caught by pattern matching as a fallback.

Detected affiliations are stored as an array of org label strings on each item.

### Critical Items

An item is flagged as critical based on a composite score from three factors:

- **Relevance** -- score >= 0.85.
- **Freshness** -- published within the last 48 hours.
- **Authority** -- the item comes from an org feed (per `FEED_ORG_MAP`), the user marked the feed as authoritative, or the item has detected organization affiliations.

The critical item count is displayed in the dashboard header and is clickable to filter the item list.

---

## File Structure

```
ai-intel-hub/
├── package.json                 # Root workspace: npm scripts for dev, build, and Electron
├── Dockerfile                   # Multi-stage: builds frontend, serves from Express
├── docker-compose.yml           # One-command deployment with persistent volume
├── electron-builder.yml         # Electron packaging config (macOS, Windows, Linux)
├── Makefile                     # Convenience targets for all build modes
├── README.md                    # Installation, configuration, and usage guide
├── ELECTRON.md                  # Desktop app build, signing, and distribution guide
├── ARCHITECTURE.md              # This file
│
├── electron/
│   ├── main.js                  # Electron main process: window, menu, settings, lifecycle
│   └── preload.js               # Context-isolated preload script
│
├── build/
│   ├── icon.svg                 # Source icon template (gradient + delta symbol)
│   ├── icon.png                 # Generated 1024x1024 PNG
│   ├── icon.icns                # Generated macOS icon bundle
│   └── entitlements.mac.plist   # macOS entitlements for hardened runtime
│
├── scripts/
│   └── generate-icons.js        # SVG → PNG → .icns/.ico icon generator
│
├── .github/workflows/
│   └── build-electron.yml       # CI/CD: builds macOS + Windows, creates GitHub Release
│
├── backend/
│   ├── package.json             # Express, rss-parser, node-cron, dotenv
│   ├── .env.example             # Template: ANTHROPIC_API_KEY, RELEVANCE_CONTEXT, etc.
│   ├── .env                     # Local config (gitignored)
│   ├── feeds.json               # Default feed configuration (~50 feeds)
│   ├── data/
│   │   └── db.json              # Persistent store (gitignored)
│   └── src/
│       ├── server.js            # Express app, API routes, cron jobs, createServer()
│       ├── db.js                # Persistence layer (JSON-file, in-memory with debounced writes)
│       ├── fetcher.js           # RSS/Atom feed parser, tag extraction, batch fetching
│       ├── scorer.js            # Claude API integration: scoring, analysis, feed health
│       └── default-feeds.js     # Feed configuration loader/saver
│
└── frontend/
    ├── package.json             # React 18, Vite
    ├── vite.config.js           # Dev proxy /api → localhost:3001
    ├── index.html               # Entry HTML with font imports
    └── src/
        ├── main.jsx             # React entry point
        ├── api.js               # API client (fetch wrapper, all endpoints)
        └── App.jsx              # Full dashboard: sidebar, feed list, analysis panel, sources
```

**Line counts (approximate):**
| File | Lines | Role |
|------|-------|------|
| `backend/src/server.js` | 400 | API routes, scheduler, startup, Electron settings |
| `backend/src/scorer.js` | 337 | LLM scoring and analysis |
| `backend/src/fetcher.js` | 191 | RSS parsing and ingestion |
| `backend/src/db.js` | 254 | Persistence layer |
| `backend/src/default-feeds.js` | 17 | Feed configuration loader |
| `electron/main.js` | 259 | Electron main process |
| `frontend/src/App.jsx` | 665 | Dashboard UI |
| `frontend/src/api.js` | 54 | API client |
| **Total** | **~2,200** | |

---

## Data Model

### Feed
```javascript
{
  id: "arxiv-cs-ai",           // Unique ID (string)
  name: "arXiv cs.AI",         // Display name
  url: "https://...",          // Feed URL (RSS endpoint, X profile URL, etc.)
  type: "rss",                 // "rss" | "x-account" | "scrape" | "linkedin"
  category: "research",        // "research" | "engineering" | "industry" | "policy" | "labs"
  active: 1,                   // 1 = enabled, 0 = disabled
  last_fetched: "ISO8601",     // Last successful fetch timestamp
  last_error: "string|null",   // Last error message
  item_count: 42,              // Items returned on last fetch
  avg_relevance: 0.72,         // Average relevance of items from this feed
  authoritative: 0,            // 0/1 — user-designated authoritative source (boosts critical scoring)
  created_at: "ISO8601",
  updated_at: "ISO8601"
}
```

### Item
```javascript
{
  id: "a3f8c2e1...",           // SHA256 hash of feedId + guid/url (16 chars)
  feed_id: "arxiv-cs-ai",     // Foreign key to feed
  title: "...",                // Article/post title
  summary: "...",              // Extracted text summary (max ~600 chars)
  url: "https://...",          // Link to original content
  author: "...",               // Author if available
  published: "ISO8601",        // Publication date
  fetched_at: "ISO8601",       // When we ingested it
  category: "research",        // Inherited from feed
  relevance: 0.85,             // 0.0-1.0, scored by Claude (0.5 = unscored)
  relevance_reason: "...",     // One-sentence explanation of why it matters
  tags: ["agents", "MCP"],     // Auto-extracted + LLM-generated tags
  read: 0,                     // 0/1
  saved: 0,                    // 0/1
  dismissed: 0,                // 0/1 (soft delete)
  affiliations: ["OpenAI", "Stanford"]  // Array of org label strings (detected by LLM/feed/regex)
}
```

### Feed categories
| Key | Label | Content |
|-----|-------|---------|
| `research` | AI Research | arXiv, research blogs, technical substacks |
| `engineering` | Engineering & Practice | Builder blogs, tool evaluations, production patterns |
| `industry` | Industry & Capital | VCs, market analysis, startup news, enterprise adoption |
| `policy` | Policy & Governance | Regulation, safety, ethics, geopolitics |
| `labs` | AI Labs | Official blogs from OpenAI, Anthropic, DeepMind, Meta AI, etc. |

---

## Key Data Flows

### 1. Feed Refresh (automatic every 30 min, or manual via API)

```
cron trigger / POST /api/fetch
  → fetcher.fetchAllFeeds()
    → for each active RSS feed (concurrency = 5):
        → rss-parser.parseURL(feed.url)
        → extract summary, tags from each entry
        → generate stable item ID via SHA256(feedId + guid)
        → db.upsertItem() for each (skip duplicates)
        → db.updateFeedStatus() with last_fetched, error, count
  → if ANTHROPIC_API_KEY set:
      → scorer.scoreUnscoredItems()
        → find items where relevance === 0.5 and no relevance_reason
        → batch into groups of 15
        → for each batch: call Claude to score relevance 0.0-1.0
        → parse JSON response, update items in DB
```

### 2. LLM Analysis (triggered by user from Analysis Panel)

```
POST /api/analyze { mode: "briefing", category: "research" }
  → scorer.generateAnalysis(mode, category)
    → check analysis cache (30 min TTL)
    → if miss: fetch top 15 items by relevance
    → construct prompt for selected mode:
        "briefing" → Critical Developments / Strategic Signals / Action Items
        "risks"    → Regulatory / Technology / Vendor / Operational risks
        "gaps"     → Coverage gaps / Perspective bias / Suggested additions
        "what-so-what-now-what" → What changed / So what / Now what
    → call Claude Sonnet with RELEVANCE_CONTEXT as system context
    → cache result, return to frontend
```

### 3. Feed Health Analysis

```
POST /api/health/analyze
  → db.getFeedHealth() → per-feed stats (item count, latest item, avg relevance)
  → scorer.analyzeFeedHealth(healthData)
    → call Claude to identify stale feeds, noisy feeds, and suggest new sources
    → return { stale: [...], noisy: [...], suggestions: [...] }
```

---

## Design Decisions and Rationale

### JSON-file persistence instead of SQLite
The original design used `better-sqlite3`, but native compilation dependencies create friction for cross-platform setup. The current JSON-file approach (`db.js`) has zero native dependencies, starts instantly, and is trivially swappable. The interface is identical — replacing `db.js` with a SQLite or PostgreSQL implementation requires changing only that one file. For a single-user local application, JSON-file performance is more than adequate (tested to ~10K items with no noticeable latency).

### Server-side LLM calls
The API key lives in `backend/.env` and all Claude calls route through the backend. This keeps the key out of the browser, enables server-side caching, and allows batch scoring on a schedule without user interaction.

### Relevance scoring as a separate pass
Items are ingested with a default relevance of 0.5. Scoring happens asynchronously after ingestion, in batches of 15. This decouples fetching from scoring — feeds still populate even if the API key is missing or Claude is slow. The "unscored" state (0.5 + no relevance_reason) is detectable, so scoring can be re-triggered.

### Tag extraction: rule-based first, LLM-enhanced second
`fetcher.js` does fast regex-based tag extraction at ingest time (zero API cost). The LLM scorer can add or refine tags during the scoring pass. This means items are immediately searchable by rough tags, with LLM enrichment as a follow-up.

### X/Twitter accounts as tracked bookmarks
X accounts are stored as feeds with `type: "x-account"` but the fetcher currently skips them (no X API integration). They serve as the user's curated list and appear in the dashboard UI. Live tweet ingestion is planned as a future enhancement.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | For LLM features | — | Claude API key |
| `PORT` | No | 3001 | Backend port |
| `FEED_REFRESH_INTERVAL` | No | 30 | Minutes between auto-refresh cycles |
| `RELEVANCE_CONTEXT` | Strongly recommended | Generic | Describes the user's role, focus areas, and priorities. Directly controls relevance scoring quality. |
| `DATA_DIR` | No | `./data/` | Where persistent data (db.json) is stored |
| `NODE_ENV` | No | development | Set to `production` to serve frontend from Express |
| `LLM_PROVIDER` | No | anthropic | LLM provider (anthropic, openai, gemini, ollama) |
| `LLM_MODEL` | No | Provider default | Model to use for scoring and analysis |
| `OPENAI_API_KEY` | For OpenAI | — | OpenAI API key |
| `GEMINI_API_KEY` | For Gemini | — | Google Gemini API key |
| `OLLAMA_BASE_URL` | For Ollama | `http://localhost:11434` | Ollama server endpoint |

---

## API Reference

### Feeds
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feeds` | List all feeds |
| POST | `/api/feeds` | Add feed `{id?, name, url, type, category}` |
| PUT | `/api/feeds/:id` | Update feed |
| DELETE | `/api/feeds/:id` | Delete feed and its items |

### Items
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/items?category=&minRelevance=&search=&limit=&offset=&saved=` | Filtered item list |
| POST | `/api/items/:id/read` | Mark as read |
| POST | `/api/items/:id/save` | Toggle saved `{saved: bool}` |
| POST | `/api/items/:id/dismiss` | Soft-delete from feed |

### Actions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fetch` | Refresh all RSS feeds now |
| POST | `/api/fetch/:feedId` | Refresh single feed |
| POST | `/api/score` | Score all unscored items via configured LLM |
| POST | `/api/analyze` | Generate analysis `{mode, category?}` |

### Health & Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/health/feeds` | Per-feed health metrics |
| POST | `/api/health/analyze` | LLM feed health analysis with suggestions |
| GET | `/api/stats` | Dashboard statistics |

### Organizations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orgs` | List recognized organizations for affiliation tagging |
| GET | `/api/ollama/models` | List locally available Ollama models |

---

# TODO — Improvement Roadmap

Organized by priority and effort. Items marked `[MVP]` are the most impactful near-term improvements.

## P0: Core Functionality Gaps

### `[MVP]` T1: X/Twitter ingestion via RSS bridge
**What:** Add support for fetching tweets from X accounts using third-party RSS bridges (e.g., rss.app, Nitter instances, or similar services) as a lightweight alternative to the X API.
**Where:** `backend/src/fetcher.js` — add a new fetcher path for `type: "x-account"` feeds that rewrites the X profile URL to an RSS bridge URL before parsing.
**Why:** X accounts are currently display-only bookmarks. This is the single biggest coverage gap since X is a primary signal source.
**Complexity:** Low-medium. The RSS parsing infrastructure already exists; this is primarily URL rewriting and testing.

### `[MVP]` T2: Pagination and infinite scroll
**What:** The frontend currently loads up to 100 items. Implement cursor-based pagination in the API and infinite scroll or "Load More" in the frontend.
**Where:** `backend/src/server.js` (GET /api/items already supports limit/offset), `frontend/src/App.jsx`.
**Complexity:** Low.

### `[MVP]` T3: Error handling and loading states in frontend
**What:** The frontend has minimal error handling. Add toast notifications for failed API calls, loading skeletons for initial data fetch, and retry logic for transient failures.
**Where:** `frontend/src/App.jsx` — create a shared notification/toast component.
**Complexity:** Low.

### T4: Feed OPML import/export
**What:** Allow importing feeds from OPML files (standard RSS reader export format) and exporting the current feed list as OPML.
**Where:** New endpoint `POST /api/feeds/import` and `GET /api/feeds/export` in `server.js`.
**Why:** Makes it easy to migrate from existing RSS readers and share feed configurations.
**Complexity:** Low.

---

## P1: LLM Pipeline Improvements

### `[MVP]` T5: Incremental scoring with deduplication
**What:** Currently, scoring processes all items with `relevance === 0.5`. After a re-fetch, previously scored items can get their relevance reset. Improve the upsert logic to preserve existing scores when re-fetching, and only score genuinely new items.
**Where:** `backend/src/db.js` (upsertItem logic), `backend/src/scorer.js` (scoreUnscoredItems).
**Complexity:** Low. The logic partially exists but the 0.5 sentinel value is fragile.

### T6: Batch analysis with streaming
**What:** The analysis panel blocks until Claude returns the full response. Implement streaming (Anthropic streaming API) so the briefing appears progressively.
**Where:** `backend/src/scorer.js` (callClaude function), new SSE endpoint in `server.js`, frontend streaming reader.
**Complexity:** Medium.

### T7: User feedback loop for relevance calibration
**What:** When a user saves, dismisses, or spends time on an item, use that signal to refine the relevance scoring prompt. Maintain a small set of "example items" (highly relevant saves + low-relevance dismissals) and include them as few-shot examples in the scoring prompt.
**Where:** `backend/src/scorer.js` (add feedback examples to scoring prompt), `backend/src/db.js` (track interaction signals).
**Why:** The static RELEVANCE_CONTEXT is good but coarse. Behavioral signals would make scoring significantly sharper over time.
**Complexity:** Medium.

### T8: Multi-model support
**What:** Allow configuring different models for scoring vs. analysis (e.g., Haiku for high-volume scoring, Opus for executive briefings). Add model selection to `.env` or make it per-task configurable.
**Where:** `backend/src/scorer.js` — parameterize the MODEL constant.
**Complexity:** Low.

### T9: Deduplication and clustering
**What:** Multiple feeds often cover the same news (e.g., a model release appears on the lab blog, in arXiv, and across several substacks). Detect near-duplicate items and cluster them, showing the best/most relevant source and noting how many sources covered it.
**Where:** New module `backend/src/dedup.js`. Use embedding similarity (via Claude or a lightweight embedding model) or title/URL fuzzy matching.
**Why:** Reduces noise significantly. A development that appears across 5 feeds is both important (signal) and redundant (noise). Clustering solves both.
**Complexity:** Medium-high.

---

## P2: New Source Types

### T10: Web scraping for non-RSS sources
**What:** Some important sources (regulatory body websites, vendor changelog pages, specific government publications) don't offer RSS. Add a web scraper that monitors specific URLs for changes and generates synthetic feed items from detected changes.
**Where:** New module `backend/src/scraper.js`, invoked alongside RSS fetcher in the cron job. Use `cheerio` for HTML parsing and a content hash to detect changes.
**Complexity:** Medium. Each target page may need custom selectors.

### T11: LinkedIn post monitoring
**What:** Several important AI voices (Sarah Guo, many policy people) have moved primarily to LinkedIn. Explore LinkedIn RSS feeds (some exist via unofficial routes) or periodic scraping of public profiles.
**Where:** New feed type handler in `fetcher.js`.
**Complexity:** Medium-high. LinkedIn actively blocks scraping; may require a third-party service.

### T12: YouTube transcript ingestion
**What:** For tracked YouTube channels (conference talks, technical deep-dives), auto-detect new videos, extract transcripts via YouTube's auto-generated captions, and generate summaries via Claude.
**Where:** New module `backend/src/youtube.js`. Use YouTube Data API v3 for channel monitoring, `youtube-transcript` package or yt-dlp for transcript extraction.
**Why:** This was identified in the original design conversation as high-leverage — YouTube has unique long-form content not available elsewhere, but the time cost of watching is prohibitive. Transcript + summary collapses a 60-minute video into a 2-minute scan.
**Complexity:** Medium.

### T13: arXiv enhanced processing
**What:** arXiv RSS feeds only provide titles and short abstracts. For papers that score above a relevance threshold (e.g., 0.8+), automatically fetch the full abstract from the arXiv API and optionally download the PDF for deeper LLM analysis.
**Where:** Enhancement to `fetcher.js` for arXiv feeds, plus a post-processing step in the scoring pipeline.
**Complexity:** Medium.

---

## P3: Frontend Enhancements

### T14: Component decomposition
**What:** `App.jsx` is currently a 400-line monolith. Split into proper components: `Header`, `Sidebar`, `ItemCard`, `ItemList`, `AnalysisPanel`, `SettingsPanel`, `FeedHealthPanel`.
**Where:** `frontend/src/components/` directory.
**Why:** Necessary for maintainability as the UI grows.
**Complexity:** Low-medium. Mechanical refactor.

### T15: Dark/light theme and responsive layout
**What:** The UI is currently dark-only and assumes desktop width. Add a theme toggle (respecting system preference) and responsive breakpoints for tablet/mobile use.
**Where:** CSS variables are partially in place. Extend with media queries and theme switching.
**Complexity:** Medium.

### T16: Keyboard navigation
**What:** Add keyboard shortcuts: `j/k` for next/previous item, `o` to open source, `s` to save, `d` to dismiss, `/` to focus search, `a` to toggle analysis panel.
**Where:** `frontend/src/App.jsx` — add a `useEffect` with `keydown` listener.
**Why:** Power users (the target audience) expect keyboard-driven workflows.
**Complexity:** Low.

### T17: Saved items view and weekly digest export
**What:** Add a dedicated "Saved" view that shows all saved items. Add an export function that generates a markdown digest of saved items from the past week, suitable for pasting into an email or document.
**Where:** Frontend: new view/filter. Backend: new endpoint `GET /api/items/digest?period=7d` that returns formatted markdown.
**Complexity:** Low-medium.

### T18: Feed health dashboard
**What:** The current feed health is only available via the LLM analysis. Build a dedicated visual dashboard showing each feed's update frequency, relevance trend, error rate, and staleness score as a grid of cards with sparkline charts.
**Where:** New component `frontend/src/components/FeedHealthDashboard.jsx`.
**Complexity:** Medium.

---

## P4: Infrastructure and Deployment

### T19: Switch persistence to SQLite
**What:** Replace `db.js` JSON-file store with `better-sqlite3` for better performance at scale, proper indexing, and atomic writes. The current API surface in `db.js` was designed to make this a drop-in replacement.
**Where:** Rewrite `backend/src/db.js`. The function signatures and return shapes should remain identical.
**Complexity:** Medium. The interface is stable; the implementation is mechanical.

### T20: Add authentication
**What:** For any non-localhost deployment, add authentication. Options: simple API key header check (minimal), or JWT-based auth with a login page.
**Where:** Express middleware in `server.js`, frontend auth wrapper.
**Complexity:** Low (API key) to Medium (JWT/OAuth).

### T21: Health check endpoint for monitoring
**What:** Enhance `GET /api/health` to include: last successful fetch time, number of feed errors, LLM API status (can reach Anthropic), disk usage of data directory.
**Where:** `backend/src/server.js`.
**Complexity:** Low.

### T22: Logging and observability
**What:** Replace `console.log` with a structured logger (e.g., `pino`). Add request logging middleware. Emit metrics for: feed fetch duration, scoring latency, API error rates.
**Where:** New module `backend/src/logger.js`, integrate across all modules.
**Complexity:** Low-medium.

### T23: PostgreSQL option for multi-user / cloud
**What:** For deployment on platforms with ephemeral filesystems (Railway, Fly.io), provide a PostgreSQL implementation of `db.js`. Use the same function signatures. Add a `DB_TYPE=postgres` env var to switch between JSON/SQLite/PG.
**Where:** New file `backend/src/db-postgres.js`, factory pattern in a `backend/src/db-factory.js`.
**Complexity:** Medium.

---

## P5: Advanced / Long-term

### T24: Embedding-based semantic search
**What:** Generate embeddings for all items (via Claude or a local model) and store them. Enable semantic search ("show me everything related to agent memory architecture") instead of just keyword matching.
**Where:** New module `backend/src/embeddings.js`, vector similarity search in `db.js`, new API endpoint.
**Complexity:** High.

### T25: Trend detection
**What:** Analyze tag frequency and relevance scores over time windows (7d, 30d) to detect emerging topics, rising/falling themes, and anomalous spikes. Surface as a "Trends" section in the dashboard.
**Where:** New module `backend/src/trends.js`, frontend component.
**Complexity:** Medium-high.

### T26: Personal knowledge graph
**What:** Build a graph of connections between items, feeds, tags, and user interactions. Use it to surface related items, identify coverage clusters, and visualize the user's AI knowledge landscape.
**Where:** Major new feature. Consider a lightweight graph DB or in-memory graph structure.
**Complexity:** High.

### T27: Email/Slack digest delivery
**What:** Generate and send a periodic digest (daily or weekly) via email or Slack webhook. Include top items by relevance, new critical developments, and feed health alerts.
**Where:** New module `backend/src/digest.js`, new cron job, SMTP or webhook configuration.
**Complexity:** Medium.

### T28: Multi-user support
**What:** Support multiple users, each with their own feed configuration, relevance context, and interaction history. Requires authentication (T20), per-user data isolation, and likely PostgreSQL (T23).
**Where:** Architectural change across all layers.
**Complexity:** High.

---

## Development Notes for Claude Code

### Running locally
```bash
npm run setup          # Install deps, create .env from template
nano backend/.env      # Add ANTHROPIC_API_KEY
npm run dev            # Starts backend (3001) + frontend (5173)
npm run electron:dev   # Or run as desktop app with HMR
```

### Testing a change
- Backend changes auto-reload via `node --watch` (client-server) or require restart (Electron)
- Frontend changes hot-reload via Vite HMR in both modes
- To manually trigger a feed refresh: `curl -X POST http://localhost:3001/api/fetch`
- To manually trigger scoring: `curl -X POST http://localhost:3001/api/score`
- To test analysis: `curl -X POST http://localhost:3001/api/analyze -H 'Content-Type: application/json' -d '{"mode":"briefing"}'`

### Key conventions
- Backend uses ES modules (`"type": "module"` in package.json)
- All dates are ISO 8601 strings
- The `db.js` module is the single persistence interface — all other modules import from it. Never bypass it.
- Item IDs are deterministic hashes (SHA256 of feedId + entry guid) to enable idempotent upserts
- Relevance of exactly 0.5 with null `relevance_reason` indicates an unscored item
- The `RELEVANCE_CONTEXT` env var is injected into all LLM prompts as system context — changing it changes scoring behavior globally
- `server.js` exports `createServer(port)` — called by Electron or auto-invoked in standalone mode
- `ELECTRON_MODE` env var, when set, prevents auto-start and enables static file serving from built frontend

### Adding a new feed source type
1. Add a fetcher function in `fetcher.js` that returns `{items: [...], error: null}`
2. Items must conform to the shape expected by `db.upsertItem()`
3. Register the new type in `fetchAllFeeds()` alongside the RSS path
4. Add the type option to the frontend Sources panel dropdown

### Adding a new analysis mode
1. Add a prompt template to the `prompts` object in `scorer.js` → `generateAnalysis()`
2. Add a button for it in the Analysis Panel in `frontend/src/App.jsx`
3. The cache key is `(mode, category)` — new modes are automatically cached
