# AI Intelligence Hub — Architecture & Development Guide

## Purpose

This document describes the architecture, design decisions, data flows, and planned improvements for the AI Intelligence Hub. It is intended as the primary onboarding document for any developer or AI coding agent (e.g. Claude Code) working on this codebase.

The AI Intelligence Hub is a personalized feed aggregation and analysis platform for a senior technology executive at a GSIB (Global Systemically Important Bank). It consolidates AI-related content from RSS feeds, Substacks, arXiv, AI lab blogs, and tracked X/Twitter accounts into a single dashboard. An LLM layer (Claude via Anthropic API) provides relevance scoring, daily summaries, and feed health analysis personalized to the user's specific role and focus areas.

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
                         │  │    Daily summaries   │  │
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

A shared registry of recognized organizations (AI labs, big tech companies, and top universities). Users can add custom organizations via the Settings panel or `POST /api/orgs`; user-added orgs are persisted in `settings.json` under the `USER_ORGS` key. The registry:

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

### Client-Side vs Server-Side Filtering

The dashboard uses a split filtering architecture for responsiveness:

- **Server-side (coarse) filters:** Category, search, and critical item toggling are sent as query params to `GET /api/items`. These filters reduce the data set before it reaches the client.
- **Client-side (fine) filters:** Relevance threshold, recency, organizations, and sources are applied instantly in the browser with no network round-trip. This makes slider and multi-select interactions feel immediate.

The server API supports all filter params (including `minRelevance`, `maxAgeDays`, and `orgs`) so that headless and API consumers can filter entirely server-side without a browser.

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
  category: "research",        // "research" | "engineering" | "industry" | "policy" | "labs" | "news"
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
  affiliations: ["OpenAI", "Stanford"], // Array of org label strings (detected by LLM/feed/regex)
  embedding: [0.012, -0.034, ...],     // Float32 vector (length depends on model) for semantic dedup
  cluster_id: "a3f8c2e1..."            // ID of canonical item in dedup cluster (null if unique)
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
| `news` | AI News & Announcements | AI-focused news from major tech publications, newsletters, and curated X accounts |

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
        "briefing" → Daily Summary: Critical Developments / Strategic Signals / Action Items
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
| `LLM_ANALYSIS_PROVIDER` | No | Same as `LLM_PROVIDER` | Separate provider for analysis/briefings (allows different model than scoring) |
| `LLM_ANALYSIS_MODEL` | No | Same as `LLM_MODEL` | Model to use for analysis when `LLM_ANALYSIS_PROVIDER` is set |
| `DEDUP_ENABLED` | No | `false` | Enable semantic deduplication of items via embeddings |
| `DEDUP_THRESHOLD` | No | `0.75` | Cosine similarity threshold for considering items duplicates (0.0–1.0) |
| `DEDUP_WINDOW_DAYS` | No | `7` | Only compare items within this many days of each other |

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
| GET | `/api/items?category=&minRelevance=&search=&limit=&offset=&saved=&orgs=&maxAgeDays=` | Filtered item list (`orgs` filters by organization, `maxAgeDays` limits by recency) |
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
| POST | `/api/orgs` | Add a custom organization `{id, label, type, aliases}` |
| DELETE | `/api/orgs/:id` | Remove a user-added organization |
| GET | `/api/orgs/affiliations` | Distinct affiliations with item counts |
| GET | `/api/ollama/models` | List locally available Ollama models |

### Services
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/services/check` | Check connectivity of all configured service sessions |

### Embeddings & Dedup
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/embeddings/debug` | Debug info: embedding stats, cluster counts, threshold |
| POST | `/api/embeddings/run` | Trigger embedding generation and dedup clustering |

### LLM
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm/test` | Test LLM connectivity and return model info |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/cleanup` | Clear old items `{days}` (0 = all non-saved) |
| POST | `/api/admin/rescore` | Reset all scores to unscored state (does not re-run scoring) |
| GET | `/api/admin/rescore/stream` | SSE endpoint: re-score all items with progress events and cancel support |
| POST | `/api/admin/rescore/cancel` | Cancel an in-progress streaming rescore |

---

# TODO — Improvement Roadmap

Organized by priority and effort. Items marked `[MVP]` are the most impactful near-term improvements.

## P0: Core Functionality Gaps

### ~~T1: X/Twitter ingestion via RSS bridge~~ — OPEN
**Status:** Still needed. X accounts are listed as sources but ingestion depends on RSS bridges.
**What:** Add support for fetching tweets from X accounts using third-party RSS bridges (e.g., rss.app, Nitter instances, or similar services) as a lightweight alternative to the X API.
**Where:** `backend/src/fetcher.js` — add a new fetcher path for `type: "x-account"` feeds that rewrites the X profile URL to an RSS bridge URL before parsing.
**Complexity:** Low-medium.

### ~~T2: Pagination~~ — DONE
Implemented: 25 items per page with client-side pagination. Server supports limit/offset.

### ~~T3: Error handling and loading states~~ — PARTIALLY DONE
**Done:** Loading states, progress bars (refresh + analysis), error display in panels.
**Remaining:** Toast notifications for failed API calls, retry logic for transient failures.

### T4: Source OPML import/export — OPEN
**What:** Allow importing sources from OPML files (standard RSS reader export format) and exporting the current source list as OPML.
**Where:** New endpoint `POST /api/feeds/import` and `GET /api/feeds/export` in `server.js`.
**Complexity:** Low.

---

## P1: LLM Pipeline Improvements

### ~~T5: Incremental scoring~~ — DONE
Implemented: `scored_at` tracking prevents re-scoring. Upsert preserves existing scores on re-fetch.

### T6: Streaming analysis — OPEN
**What:** The analysis panel blocks until the LLM returns the full response. Implement streaming so the briefing appears progressively.
**Where:** `backend/src/scorer.js` (callLLM function), new SSE endpoint in `server.js`, frontend streaming reader.
**Complexity:** Medium.

### ~~T7: User feedback loop for relevance calibration~~ — DONE
Implemented: `getRecentFeedbackExamples()` in `db.js` queries recent items with user signals (thumbs up/down, save, dismiss). Up to 10 examples (5 liked, 5 disliked) are injected as calibration examples into the scoring system prompt in `scorer.js`. Explicit feedback (thumbs up/down) overrides implicit signals (save/dismiss). The feature activates automatically once the user has provided at least 2 feedback signals. Cold start (no feedback) leaves the prompt unchanged.

### ~~T8: Multi-model support~~ — DONE
Implemented: Multi-provider LLM (Anthropic, OpenAI, Gemini, Ollama) with per-provider model selection.

### ~~T9: Deduplication and clustering~~ — DONE
Implemented: Semantic deduplication via `backend/src/embeddings.js`. Items are embedded using the configured LLM provider, then clustered using union-find with configurable cosine similarity threshold (`DEDUP_THRESHOLD`, default 0.75). Clusters link duplicates to a canonical item via `cluster_id`. Dedup controls exposed in Settings panel; debug endpoint at `GET /api/embeddings/debug`.

---

## P2: New Source Types

### T10: Web scraping for non-RSS sources — OPEN
**What:** Monitor specific URLs for changes and generate synthetic items from detected changes. Useful for regulatory sites, vendor changelogs, government publications.
**Where:** New module `backend/src/scraper.js`, use `cheerio` for HTML parsing and content hashing.
**Complexity:** Medium.

### T11: LinkedIn post monitoring — OPEN
**What:** LinkedIn is a primary channel for many voices. Explore RSS bridges or periodic scraping of public profiles.
**Complexity:** Medium-high. LinkedIn actively blocks scraping.

### T12: YouTube transcript ingestion — OPEN
**What:** For tracked YouTube channels, extract transcripts via auto-generated captions and generate LLM summaries. Collapses a 60-minute video into a 2-minute scan.
**Where:** New module `backend/src/youtube.js`. Use YouTube Data API v3 + `youtube-transcript` package.
**Complexity:** Medium. High value.

### T13: arXiv enhanced processing — OPEN
**What:** For high-relevance papers (>0.8), fetch full abstracts from arXiv API and optionally process PDFs for deeper analysis.
**Where:** Enhancement to `fetcher.js` + post-processing in scoring pipeline.
**Complexity:** Medium.

---

## P3: Frontend Enhancements

### ~~T14: Component decomposition~~ — DONE
Decomposed `App.jsx` from 2427 lines to 545 lines (78% reduction). Extracted 8 modules into `frontend/src/components/`: SourcesPanel (530), SettingsPanel (683), AnalysisPanel (196), services (155), SavedItemsPanel (94), ItemHoverPopover (46), ThemeToggle (23), OrgBadge (15). Shared constants extracted to `constants.js` (50).

### ~~T15: Dark/light theme~~ — DONE
Implemented: System/light/dark theme toggle with CSS variables.

### T16: Keyboard navigation — OPEN
**What:** Add keyboard shortcuts: `j/k` for next/previous item, `o` to open source, `s` to save, `d` to dismiss, `/` to focus search.
**Complexity:** Low.

### ~~T17: Saved items view~~ — PARTIALLY DONE
**Done:** Saved items panel with category filter.
**Remaining:** Weekly digest export as markdown.

### T18: Source health dashboard with sparklines — OPEN
**What:** Visual dashboard with per-source update frequency, relevance trend, error rate as a grid of cards with sparkline charts.
**Done so far:** Health indicators and status in Sources panel. Missing: visual trends/sparklines.
**Complexity:** Medium.

---

## P4: Infrastructure and Deployment

### T19: Switch persistence to SQLite — OPEN
**What:** Replace JSON-file store with `better-sqlite3` for better performance, indexing, and atomic writes. The `db.js` API surface was designed for drop-in replacement.
**Complexity:** Medium.

### T20: Add authentication — OPEN
**What:** For non-localhost deployments. Options: API key header (minimal) or JWT-based auth.
**Complexity:** Low (API key) to Medium (JWT/OAuth).

### T21: Enhanced health check endpoint — OPEN
**What:** Include last fetch time, feed error count, LLM API status, disk usage in `GET /api/health`.
**Complexity:** Low.

### T22: Structured logging — OPEN
**What:** Replace `console.log` with structured logger (e.g., `pino`). Add request logging and metrics.
**Complexity:** Low-medium.

### T23: PostgreSQL option — OPEN
**What:** For cloud platforms with ephemeral filesystems. Same `db.js` function signatures, `DB_TYPE=postgres` env var.
**Complexity:** Medium.

---

## P5: Advanced / Long-term

### T24: Embedding-based semantic search — OPEN
**What:** Generate embeddings for all items. Enable semantic search instead of keyword matching.
**Complexity:** High.

### T25: Trend detection — OPEN
**What:** Detect emerging topics, rising/falling themes from tag frequency and relevance over time. Surface as a "Trends" section.
**Complexity:** Medium-high.

### T26: Personal knowledge graph — OPEN
**What:** Graph of connections between items, sources, tags, and interactions. Surface related items, coverage clusters.
**Complexity:** High.

### T27: Email/Slack digest delivery — OPEN
**What:** Periodic digest (daily/weekly) via email or Slack webhook with top items, critical developments, health alerts.
**Complexity:** Medium.

### T28: Multi-user support — OPEN
**What:** Per-user feed configuration, relevance context, and interaction history. Requires T20 + T23.
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
