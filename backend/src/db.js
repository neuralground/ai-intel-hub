import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

let store = { feeds: [], items: [], suggestions: [], analysisCache: [] };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      store = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      store.feeds = store.feeds || [];
      store.items = store.items || [];
      store.suggestions = store.suggestions || [];
      store.analysisCache = store.analysisCache || [];
      console.log(`[DB] Loaded ${store.feeds.length} feeds, ${store.items.length} items`);
    }
  } catch (err) {
    console.error("[DB] Failed to load, starting fresh:", err.message);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2)); } catch (e) { console.error("[DB] Save failed:", e.message); }
    saveTimer = null;
  }, 1000);
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2)); } catch (e) { /* */ }
}

load();
process.on("exit", saveNow);
process.on("SIGINT", () => { saveNow(); process.exit(); });
process.on("SIGTERM", () => { saveNow(); process.exit(); });

export function getAllFeeds() {
  return store.feeds.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
}
export function getActiveFeeds() {
  return store.feeds.filter(f => f.active).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
}
export function upsertFeed(feed) {
  const idx = store.feeds.findIndex(f => f.id === feed.id);
  const now = new Date().toISOString();
  if (idx >= 0) { store.feeds[idx] = { ...store.feeds[idx], ...feed, updated_at: now }; }
  else { store.feeds.push({ ...feed, active: feed.active ?? 1, created_at: now, updated_at: now }); }
  save();
  return { changes: 1 };
}
export function updateFeedStatus(feedId, { lastFetched, lastError, itemCount, avgRelevance }) {
  const feed = store.feeds.find(f => f.id === feedId);
  if (!feed) return;
  if (lastFetched) feed.last_fetched = lastFetched;
  feed.last_error = lastError || null;
  if (itemCount != null) feed.item_count = itemCount;
  if (avgRelevance != null) feed.avg_relevance = avgRelevance;
  feed.updated_at = new Date().toISOString();
  save();
}
export function deleteFeed(feedId) {
  store.items = store.items.filter(i => i.feed_id !== feedId);
  store.feeds = store.feeds.filter(f => f.id !== feedId);
  save();
}

export function upsertItem(item) {
  const n = {
    id: item.id, feed_id: item.feedId || item.feed_id, title: item.title,
    summary: item.summary || "", url: item.url || "", author: item.author || "",
    published: item.published || new Date().toISOString(),
    fetched_at: item.fetched_at || new Date().toISOString(),
    category: item.category || "", relevance: item.relevance ?? 0.5,
    relevance_reason: item.relevanceReason || item.relevance_reason || null,
    tags: item.tags || [], read: item.read ?? 0, saved: item.saved ?? 0, dismissed: item.dismissed ?? 0,
  };
  const idx = store.items.findIndex(i => i.id === n.id);
  if (idx >= 0) {
    const ex = store.items[idx];
    store.items[idx] = { ...n, read: ex.read, saved: ex.saved, dismissed: ex.dismissed,
      relevance: item.relevance !== 0.5 ? n.relevance : ex.relevance,
      relevance_reason: n.relevance_reason || ex.relevance_reason,
      tags: n.tags.length > 0 ? n.tags : ex.tags,
    };
  } else { store.items.push(n); }
  save();
  return { changes: idx >= 0 ? 0 : 1 };
}

export function getItems({ category, minRelevance = 0, limit = 100, offset = 0, saved, search }) {
  let r = store.items.filter(i => !i.dismissed);
  if (category && category !== "all") r = r.filter(i => i.category === category);
  if (minRelevance > 0) r = r.filter(i => i.relevance >= minRelevance);
  if (saved) r = r.filter(i => i.saved);
  if (search) { const q = search.toLowerCase(); r = r.filter(i => (i.title||"").toLowerCase().includes(q) || (i.summary||"").toLowerCase().includes(q) || (i.tags||[]).some(t => t.toLowerCase().includes(q))); }
  r.sort((a, b) => new Date(b.published) - new Date(a.published));
  return r.slice(offset, offset + limit);
}

export function getItemCount({ category, minRelevance = 0 }) {
  let r = store.items.filter(i => !i.dismissed);
  if (category && category !== "all") r = r.filter(i => i.category === category);
  if (minRelevance > 0) r = r.filter(i => i.relevance >= minRelevance);
  return r.length;
}

export function markItem(itemId, field, value) {
  const item = store.items.find(i => i.id === itemId);
  if (item) { item[field] = value ? 1 : 0; save(); }
}

export function getStats() {
  const active = store.items.filter(i => !i.dismissed);
  const byCat = {};
  for (const item of active) {
    if (!byCat[item.category]) byCat[item.category] = { category: item.category, count: 0, totalRel: 0 };
    byCat[item.category].count++;
    byCat[item.category].totalRel += item.relevance;
  }
  return {
    totalItems: active.length, unread: active.filter(i => !i.read).length,
    critical: active.filter(i => i.relevance >= 0.85).length,
    saved: active.filter(i => i.saved).length,
    byCategory: Object.values(byCat).map(c => ({ category: c.category, count: c.count, avg_relevance: c.count > 0 ? c.totalRel / c.count : 0 })),
  };
}

export function getFeedHealth() {
  return store.feeds.map(f => {
    const fi = store.items.filter(i => i.feed_id === f.id && !i.dismissed);
    const latest = fi.length > 0 ? fi.reduce((a, b) => new Date(a.published) > new Date(b.published) ? a : b).published : null;
    const avgRel = fi.length > 0 ? fi.reduce((s, i) => s + i.relevance, 0) / fi.length : 0;
    return { ...f, live_items: fi.length, latest_item: latest, computed_avg_relevance: avgRel };
  });
}

export function addSuggestion(s) { store.suggestions.push({ ...s, id: Date.now(), status: "pending", created_at: new Date().toISOString() }); save(); }
export function getSuggestions() { return store.suggestions.filter(s => s.status === "pending"); }
export function updateSuggestionStatus(id, status) { const s = store.suggestions.find(s => s.id === id); if (s) { s.status = status; save(); } }

export function cacheAnalysis(mode, category, result, itemIds) {
  store.analysisCache.push({ mode, category, result, item_ids: itemIds, created_at: new Date().toISOString() });
  if (store.analysisCache.length > 50) store.analysisCache = store.analysisCache.slice(-50);
  save();
}
export function getCachedAnalysis(mode, category, maxAgeMinutes = 60) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
  return store.analysisCache.filter(c => c.mode === mode && (c.category === category || !category) && c.created_at > cutoff)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

export function cleanupOldItems(daysToKeep = 30) {
  const cutoff = new Date(Date.now() - daysToKeep * 86400000).toISOString();
  const before = store.items.length;
  store.items = store.items.filter(i => i.saved || i.published > cutoff);
  if (before !== store.items.length) save();
  return { changes: before - store.items.length };
}

export default store;
