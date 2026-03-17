import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import {
  getAllFeeds, getActiveFeeds, upsertFeed, deleteFeed,
  getItems, getItemCount, markItem, getStats,
  getFeedHealth, getSuggestions, addSuggestion, updateSuggestionStatus,
  cleanupOldItems,
} from "./db.js";
import { fetchAllFeeds, fetchSingleFeed } from "./fetcher.js";
import { scoreUnscoredItems, generateAnalysis, analyzeFeedHealth } from "./scorer.js";
import { DEFAULT_FEEDS } from "./default-feeds.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Initialize default feeds on first run ───────────────────────────────────
function initializeFeeds() {
  const existing = getAllFeeds();
  if (existing.length === 0) {
    console.log("[Init] Loading default feeds...");
    for (const feed of DEFAULT_FEEDS) {
      upsertFeed({ ...feed, active: 1 });
    }
    console.log(`[Init] Loaded ${DEFAULT_FEEDS.length} default feeds`);
  } else {
    console.log(`[Init] ${existing.length} feeds already configured`);
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

app.post("/api/feeds", (req, res) => {
  try {
    const feed = req.body;
    if (!feed.id) feed.id = `custom-${Date.now()}`;
    if (!feed.active) feed.active = 1;
    upsertFeed(feed);
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
    updateSuggestionStatus(parseInt(req.params.id), "accepted");
    res.json({ ok: true });
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

// ── Serve frontend in production ────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  import("path").then(({ default: path }) => {
    import("url").then(({ fileURLToPath }) => {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const frontendPath = path.join(__dirname, "..", "..", "frontend", "dist");
      app.use(express.static(frontendPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
      });
    });
  });
}

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

// ── Start ───────────────────────────────────────────────────────────────────
initializeFeeds();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         AI INTELLIGENCE HUB - Backend        ║
║──────────────────────────────────────────────║
║  Server:    http://localhost:${PORT}             ║
║  API:       http://localhost:${PORT}/api         ║
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
});

export default app;
