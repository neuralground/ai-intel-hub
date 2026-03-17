import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAllFeeds, getActiveFeeds, upsertFeed, deleteFeed,
  getItems, getItemCount, markItem, getStats,
  getFeedHealth, getSuggestions, getSuggestionById, addSuggestion, updateSuggestionStatus,
  cleanupOldItems,
} from "./db.js";
import { fetchAllFeeds, fetchSingleFeed, validateFeedUrl } from "./fetcher.js";
import { scoreUnscoredItems, generateAnalysis, analyzeFeedHealth } from "./scorer.js";
import { loadDefaultFeeds, saveDefaultFeeds } from "./default-feeds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Initialize and sync default feeds ────────────────────────────────────────
function initializeFeeds() {
  const defaultFeeds = loadDefaultFeeds();
  const existing = getAllFeeds();
  if (existing.length === 0) {
    console.log("[Init] Loading default feeds...");
    for (const feed of defaultFeeds) {
      upsertFeed({ ...feed, active: 1 });
    }
    console.log(`[Init] Loaded ${defaultFeeds.length} default feeds`);
  } else {
    // Sync: update URLs for existing feeds, deactivate removed ones
    const defaultIds = new Set(defaultFeeds.map(f => f.id));
    for (const feed of defaultFeeds) {
      upsertFeed({ ...feed, active: 1 });
    }
    for (const feed of existing) {
      if (feed.type === "rss" && !defaultIds.has(feed.id) && !feed.userAdded) {
        upsertFeed({ id: feed.id, active: 0 });
      }
    }
    console.log(`[Init] Synced ${defaultFeeds.length} default feeds`);
  }
}

// ── API Routes ──────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), feeds: getAllFeeds().length });
});

// ── Feeds ───────────────────────────────────────────────────────────────────
app.get("/api/feeds", (req, res) => {
  res.json(getAllFeeds());
});

app.post("/api/feeds", async (req, res) => {
  try {
    const feed = req.body;
    if (!feed.id) feed.id = `custom-${Date.now()}`;
    if (!feed.active) feed.active = 1;
    feed.userAdded = true;
    // Validate RSS feeds before adding
    if (feed.type === "rss") {
      const check = await validateFeedUrl(feed.url);
      if (!check.valid) return res.status(400).json({ error: `Invalid feed: ${check.error}` });
    }
    upsertFeed(feed);
    // Persist to feeds.json
    const configFeeds = loadDefaultFeeds();
    if (!configFeeds.find(f => f.id === feed.id)) {
      configFeeds.push({ id: feed.id, name: feed.name, url: feed.url, type: feed.type, category: feed.category, userAdded: true });
      saveDefaultFeeds(configFeeds);
    }
    res.json({ ok: true, feed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/feeds/:id", (req, res) => {
  try {
    const feed = { ...req.body, id: req.params.id };
    upsertFeed(feed);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/feeds/:id", (req, res) => {
  try {
    deleteFeed(req.params.id);
    // Remove from feeds.json
    const configFeeds = loadDefaultFeeds();
    const filtered = configFeeds.filter(f => f.id !== req.params.id);
    if (filtered.length !== configFeeds.length) saveDefaultFeeds(filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Items ───────────────────────────────────────────────────────────────────
app.get("/api/items", (req, res) => {
  const { category, minRelevance, limit, offset, saved, search } = req.query;
  const items = getItems({
    category,
    minRelevance: minRelevance ? parseFloat(minRelevance) : 0,
    limit: limit ? parseInt(limit) : 100,
    offset: offset ? parseInt(offset) : 0,
    saved: saved === "true",
    search,
  });
  const count = getItemCount({
    category,
    minRelevance: minRelevance ? parseFloat(minRelevance) : 0,
  });
  res.json({ items, total: count });
});

app.post("/api/items/:id/read", (req, res) => {
  markItem(req.params.id, "read", true);
  res.json({ ok: true });
});

app.post("/api/items/:id/save", (req, res) => {
  const { saved } = req.body;
  markItem(req.params.id, "saved", saved !== false);
  res.json({ ok: true });
});

app.post("/api/items/:id/dismiss", (req, res) => {
  markItem(req.params.id, "dismissed", true);
  res.json({ ok: true });
});

// ── Stats ───────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  res.json(getStats());
});

// ── Feed health ─────────────────────────────────────────────────────────────
app.get("/api/health/feeds", (req, res) => {
  res.json(getFeedHealth());
});

app.post("/api/health/analyze", async (req, res) => {
  try {
    const health = getFeedHealth();
    const analysis = await analyzeFeedHealth(health);
    // Validate and persist new suggestions
    if (analysis.suggestions) {
      const validated = [];
      const validationResults = await Promise.allSettled(
        analysis.suggestions.filter(s => s.url).map(async (s) => {
          const result = await validateFeedUrl(s.url);
          return { suggestion: s, ...result };
        })
      );
      for (const r of validationResults) {
        if (r.status === "fulfilled" && r.value.valid) {
          const s = r.value.suggestion;
          addSuggestion(s);
          validated.push(s);
        } else if (r.status === "fulfilled") {
          console.log(`[Health] Rejected suggestion "${r.value.suggestion.name}": ${r.value.error}`);
        }
      }
      analysis.suggestions = validated;
    }
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fetch / Refresh ─────────────────────────────────────────────────────────
app.post("/api/fetch", async (req, res) => {
  try {
    const result = await fetchAllFeeds();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/fetch/:feedId", async (req, res) => {
  try {
    const result = await fetchSingleFeed(req.params.feedId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LLM Scoring ─────────────────────────────────────────────────────────────
app.post("/api/score", async (req, res) => {
  try {
    const result = await scoreUnscoredItems();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LLM Analysis ────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    const { mode, category } = req.body;
    if (!mode) return res.status(400).json({ error: "mode is required" });
    const result = await generateAnalysis(mode, category || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Suggestions ─────────────────────────────────────────────────────────────
app.get("/api/suggestions", (req, res) => {
  res.json(getSuggestions());
});

app.post("/api/suggestions/:id/accept", (req, res) => {
  try {
    const suggestion = getSuggestionById(parseInt(req.params.id));
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    // Check if a feed with this URL already exists
    const existingFeed = getAllFeeds().find(f => f.url === suggestion.url);
    if (existingFeed) {
      // Just activate it if it exists but is inactive
      if (!existingFeed.active) upsertFeed({ id: existingFeed.id, active: 1 });
      updateSuggestionStatus(suggestion.id, "accepted");
      return res.json({ ok: true, feed: existingFeed });
    }
    // Create the feed from the suggestion
    const feedId = suggestion.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const feed = {
      id: feedId,
      name: suggestion.name,
      url: suggestion.url,
      type: suggestion.type || "rss",
      category: suggestion.category || "research",
      active: 1,
      userAdded: true,
    };
    upsertFeed(feed);
    // Persist to feeds.json (dedup by URL)
    const configFeeds = loadDefaultFeeds();
    if (!configFeeds.some(f => f.url === feed.url)) {
      configFeeds.push({ id: feed.id, name: feed.name, url: feed.url, type: feed.type, category: feed.category, userAdded: true });
      saveDefaultFeeds(configFeeds);
    }
    updateSuggestionStatus(suggestion.id, "accepted");
    res.json({ ok: true, feed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/suggestions/:id/dismiss", (req, res) => {
  try {
    updateSuggestionStatus(parseInt(req.params.id), "dismissed");
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Scheduled jobs ──────────────────────────────────────────────────────────
const refreshInterval = parseInt(process.env.FEED_REFRESH_INTERVAL || "30");

// Fetch feeds on schedule
cron.schedule(`*/${refreshInterval} * * * *`, async () => {
  console.log(`[Cron] Scheduled feed refresh (every ${refreshInterval} min)`);
  try {
    await fetchAllFeeds();
    // Score new items if API key is configured
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-your-key-here") {
      await scoreUnscoredItems();
    }
  } catch (err) {
    console.error("[Cron] Feed refresh failed:", err.message);
  }
});

// Daily cleanup
cron.schedule("0 3 * * *", () => {
  console.log("[Cron] Running daily cleanup...");
  const result = cleanupOldItems(30);
  console.log(`[Cron] Cleaned up ${result.changes} old items`);
});

// ── Settings API ─────────────────────────────────────────────────────────────
// Read/write app settings. In Electron mode these persist to settings.json;
// in server mode they update the running process env (and persist to settings.json
// in DATA_DIR's parent if writable).

const SETTINGS_KEYS = [
  "ANTHROPIC_API_KEY",
  "RELEVANCE_CONTEXT",
  "SCORING_INSTRUCTIONS",
  "FEED_REFRESH_INTERVAL",
  "SUBSTACK_SESSION",
  "TWITTER_SESSION",
  "LINKEDIN_SESSION",
  "THREADS_SESSION",
  "YOUTUBE_SESSION",
];

function getSettingsFile() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  return path.join(path.dirname(dataDir), "settings.json");
}

function loadSettingsFile() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsFile(), "utf-8"));
  } catch {
    return {};
  }
}

function maskKey(key) {
  if (!key || key.length < 12) return key ? "***" : "";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

app.get("/api/settings", (req, res) => {
  const saved = loadSettingsFile();
  res.json({
    anthropicApiKey: maskKey(saved.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ""),
    hasApiKey: !!(saved.ANTHROPIC_API_KEY || (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-your-key-here")),
    relevanceContext: saved.RELEVANCE_CONTEXT || process.env.RELEVANCE_CONTEXT || "",
    scoringInstructions: saved.SCORING_INSTRUCTIONS || process.env.SCORING_INSTRUCTIONS || "",
    refreshInterval: saved.FEED_REFRESH_INTERVAL || process.env.FEED_REFRESH_INTERVAL || "30",
    substackSession: maskKey(saved.SUBSTACK_SESSION || ""),
    twitterSession: maskKey(saved.TWITTER_SESSION || ""),
    linkedinSession: maskKey(saved.LINKEDIN_SESSION || ""),
    threadsSession: maskKey(saved.THREADS_SESSION || ""),
    youtubeSession: maskKey(saved.YOUTUBE_SESSION || ""),
  });
});

app.post("/api/settings", (req, res) => {
  try {
    const settingsFile = getSettingsFile();
    let settings = loadSettingsFile();
    const updates = req.body;

    for (const key of SETTINGS_KEYS) {
      if (updates[key] !== undefined) {
        settings[key] = updates[key];
        // Apply to running process immediately
        process.env[key] = updates[key];
      }
    }

    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Keep legacy endpoint for backward compat with Electron settings dialog
app.get("/api/electron/settings", (req, res) => res.redirect("/api/settings"));
app.post("/api/electron/settings", (req, res) => {
  // Forward to /api/settings
  req.url = "/api/settings";
  app.handle(req, res);
});

// ── Serve frontend in production / Electron mode ─────────────────────────────
// Registered after all API routes to avoid catch-all shadowing /api/* endpoints
if (process.env.NODE_ENV === "production" || process.env.ELECTRON_MODE) {
  const frontendPath = path.join(__dirname, "..", "..", "frontend", "dist");
  app.use(express.static(frontendPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

// ── Start ───────────────────────────────────────────────────────────────────

/**
 * Create and start the server. Used by both standalone and Electron modes.
 * @param {number} port - Port to listen on (0 for random available port)
 * @returns {Promise<import("http").Server>} The HTTP server instance
 */
export function createServer(port) {
  initializeFeeds();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`
╔══════════════════════════════════════════════╗
║         AI INTELLIGENCE HUB - Backend        ║
║──────────────────────────────────────────────║
║  Server:    http://localhost:${actualPort}             ║
║  API:       http://localhost:${actualPort}/api         ║
║  Feeds:     ${getAllFeeds().length} configured                  ║
║  Refresh:   every ${refreshInterval} minutes                  ║
║  LLM:       ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-your-key-here" ? "configured ✓" : "not configured ✗"}              ║
╚══════════════════════════════════════════════╝
      `);

      // Initial fetch on startup
      console.log("[Startup] Running initial feed fetch...");
      fetchAllFeeds().then((result) => {
        console.log(`[Startup] Fetched ${result.totalNew} new items from ${result.feeds.length} feeds`);
        if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-your-key-here") {
          console.log("[Startup] Scoring items...");
          scoreUnscoredItems().then((r) => console.log(`[Startup] Scored ${r.scored} items`));
        }
      });

      resolve(server);
    });

    server.on("error", reject);
  });
}

// When run directly (not imported by Electron), start the server immediately
if (!process.env.ELECTRON_MODE) {
  createServer(parseInt(PORT));
}

export default app;
