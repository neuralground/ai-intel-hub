import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getFeedOrg } from "./orgs.js";

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
    affiliations: item.affiliations || [],
    published: item.published || new Date().toISOString(),
    fetched_at: item.fetched_at || new Date().toISOString(),
    category: item.category || "", relevance: item.relevance ?? 0.5,
    relevance_reason: item.relevanceReason || item.relevance_reason || null,
    scored_at: item.scored_at || null,
    tags: item.tags || [], read: item.read ?? 0, saved: item.saved ?? 0, dismissed: item.dismissed ?? 0,
    feedback: item.feedback ?? null, feedback_boost: item.feedback_boost ?? 0,
  };
  const idx = store.items.findIndex(i => i.id === n.id);
  if (idx >= 0) {
    const ex = store.items[idx];
    // Preserve user state and scoring on re-fetch
    store.items[idx] = { ...n,
      read: ex.read, saved: ex.saved, dismissed: ex.dismissed,
      feedback: ex.feedback, feedback_boost: ex.feedback_boost || 0,
      fetched_at: ex.fetched_at, // keep original fetch time
      relevance: (ex.scored_at && item.relevance === 0.5) ? ex.relevance : n.relevance,
      relevance_reason: ex.relevance_reason || n.relevance_reason,
      scored_at: ex.scored_at || n.scored_at,
      tags: n.tags.length > 0 ? n.tags : ex.tags,
      affiliations: n.affiliations?.length > 0 ? n.affiliations : (ex.affiliations || []),
    };
  } else { store.items.push(n); }
  save();
  return { changes: idx >= 0 ? 0 : 1 };
}

export function getDistinctAffiliations() {
  const now = Date.now();
  const orgs = {};
  for (const item of store.items) {
    if (item.dismissed) continue;
    for (const a of (item.affiliations || [])) {
      if (!orgs[a]) orgs[a] = { count: 0, totalRelevance: 0, latestTs: 0 };
      orgs[a].count++;
      orgs[a].totalRelevance += item.relevance || 0;
      const ts = new Date(item.published).getTime();
      if (ts > orgs[a].latestTs) orgs[a].latestTs = ts;
    }
  }
  return Object.entries(orgs)
    .map(([label, o]) => {
      const avgRel = o.count > 0 ? o.totalRelevance / o.count : 0;
      const ageHours = (now - o.latestTs) / 3600000;
      // Steep penalty for stale: near-zero at 30d, midpoint at 3d
      const freshness = ageHours > 720 ? 0 : 1 / (1 + Math.pow(ageHours / 72, 3));
      // Composite: freshness (50%) + avg relevance (30%) + log count (20%)
      const score = freshness * 0.5 + avgRel * 0.3 + Math.min(1, Math.log10(o.count + 1) / 2) * 0.2;
      return { label, count: o.count, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function getItems({ category, minRelevance = 0, limit = 100, offset = 0, saved, unread, search, critical, orgs, feedIds, maxAgeDays }) {
  let r = store.items.filter(i => !i.dismissed);
  if (critical) r = r.filter(i => isCritical(i));
  if (orgs && orgs.length > 0) {
    const orgSet = new Set(orgs);
    r = r.filter(i => (i.affiliations || []).some(a => orgSet.has(a)));
  }
  if (feedIds && feedIds.length > 0) {
    const feedSet = new Set(feedIds);
    r = r.filter(i => feedSet.has(i.feed_id));
  }
  if (maxAgeDays > 0) {
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    r = r.filter(i => i.published > cutoff);
  }
  if (category && category !== "all") r = r.filter(i => i.category === category);
  if (minRelevance > 0) r = r.filter(i => i.relevance >= minRelevance);
  if (saved) r = r.filter(i => i.saved);
  if (unread) r = r.filter(i => !i.read);
  if (search) { const q = search.toLowerCase(); r = r.filter(i => (i.title||"").toLowerCase().includes(q) || (i.summary||"").toLowerCase().includes(q) || (i.tags||[]).some(t => t.toLowerCase().includes(q))); }
  // ── Scoring ─────────────────────────────────────────────────────────────────
  // Relevance (80%) + sigmoid freshness (20%). Unscored items penalized.
  // Freshness: ~1.0 for 0-3 days, 0.5 at 14 days, ~0 at 90+ days.
  const now = Date.now();
  const score = (item) => {
    const ageHours = (now - new Date(item.published).getTime()) / 3600000;
    const freshness = 1 / (1 + Math.pow(ageHours / 336, 3)); // midpoint 14d, steepness 3
    const boostedRelevance = Math.max(0, Math.min(1, item.relevance + (item.feedback_boost || 0)));
    const isUnscored = item.relevance === 0.5 && !item.scored_at;
    const base = boostedRelevance * 0.8 + freshness * 0.2;
    return isUnscored ? base - 0.3 : base;
  };

  // Pre-compute scores and sort strictly by score (primary sort)
  const scored = r.map(item => ({ item, score: score(item) }));
  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) < 0.001) return new Date(b.item.published) - new Date(a.item.published);
    return diff;
  });

  // ── Soft diversification ───────────────────────────────────────────────────
  // Prevent long runs of the same category (all view) or feed (category view).
  // If the next item has the same key as the last N items, look ahead for a
  // different-key item that's within 15% score of the current position and
  // swap it in. This preserves score ordering while breaking up monotony.
  const diversifyKey = (!category || category === "all") ? "category" : "feed_id";
  const MAX_CONSECUTIVE = (!category || category === "all") ? 2 : 3;
  const SCORE_TOLERANCE = 0.15; // only swap if scores are within 15%

  const result = [];
  const remaining = [...scored];

  while (remaining.length > 0) {
    // Count how many consecutive items of the same key we've placed
    let consecutiveCount = 0;
    if (result.length > 0) {
      const lastKey = result[result.length - 1].item[diversifyKey];
      for (let j = result.length - 1; j >= 0 && j >= result.length - MAX_CONSECUTIVE; j--) {
        if (result[j].item[diversifyKey] === lastKey) consecutiveCount++;
        else break;
      }
    }

    if (consecutiveCount >= MAX_CONSECUTIVE) {
      // Try to find a different-key item within score tolerance
      const topScore = remaining[0].score;
      let swapIdx = -1;
      const lastKey = result[result.length - 1].item[diversifyKey];
      for (let j = 1; j < remaining.length; j++) {
        if (remaining[j].item[diversifyKey] !== lastKey) {
          if (topScore - remaining[j].score <= SCORE_TOLERANCE) {
            swapIdx = j;
          }
          break; // only check the first different-key item
        }
      }
      if (swapIdx >= 0) {
        result.push(remaining.splice(swapIdx, 1)[0]);
        continue;
      }
    }

    // Default: take the highest-scoring remaining item
    result.push(remaining.shift());
  }

  r = result.map(s => s.item);
  return r.slice(offset, offset + limit);
}

export function getItemCount({ category, minRelevance = 0, unread, search, critical, orgs, feedIds, maxAgeDays }) {
  let r = store.items.filter(i => !i.dismissed);
  if (critical) r = r.filter(i => isCritical(i));
  if (orgs && orgs.length > 0) { const orgSet = new Set(orgs); r = r.filter(i => (i.affiliations || []).some(a => orgSet.has(a))); }
  if (feedIds && feedIds.length > 0) { const feedSet = new Set(feedIds); r = r.filter(i => feedSet.has(i.feed_id)); }
  if (maxAgeDays > 0) { const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString(); r = r.filter(i => i.published > cutoff); }
  if (category && category !== "all") r = r.filter(i => i.category === category);
  if (minRelevance > 0) r = r.filter(i => i.relevance >= minRelevance);
  if (unread) r = r.filter(i => !i.read);
  if (search) { const q = search.toLowerCase(); r = r.filter(i => (i.title||"").toLowerCase().includes(q) || (i.summary||"").toLowerCase().includes(q) || (i.tags||[]).some(t => t.toLowerCase().includes(q))); }
  return r.length;
}

export function markItem(itemId, field, value) {
  const item = store.items.find(i => i.id === itemId);
  if (item) { item[field] = value ? 1 : 0; save(); }
}

export function setItemFeedback(itemId, feedback) {
  const item = store.items.find(i => i.id === itemId);
  if (!item) return;
  item.feedback = feedback; // 1 = thumbs up, -1 = thumbs down, null = clear
  item.feedback_boost = feedback === 1 ? 0.15 : feedback === -1 ? -0.20 : 0;
  save();
}

export function deleteItem(itemId) {
  const before = store.items.length;
  store.items = store.items.filter(i => i.id !== itemId);
  if (before !== store.items.length) save();
  return { changes: before - store.items.length };
}

function isAuthoritativeFeed(feedId) {
  // Feed is authoritative if: mapped to an org in orgs.js, or user-marked authoritative
  if (getFeedOrg(feedId)) return true;
  const feed = store.feeds.find(f => f.id === feedId);
  return !!(feed && feed.authoritative);
}

export function isCritical(item) {
  // Require scored relevance: either has scored_at, or relevance differs from the 0.5 default
  const isScored = item.scored_at || item.relevance !== 0.5;
  if (item.relevance < 0.85 || !isScored) return false;
  const ageHours = (Date.now() - new Date(item.published).getTime()) / 3600000;
  if (ageHours > 48) return false;
  // Authoritative: from a known org feed, user-marked authoritative, or has notable affiliations
  const authoritative = isAuthoritativeFeed(item.feed_id)
    || (item.affiliations && item.affiliations.length > 0);
  // Very high relevance alone qualifies (>= 0.95), otherwise need authority
  return item.relevance >= 0.95 || (item.relevance >= 0.85 && authoritative);
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
    critical: active.filter(i => isCritical(i)).length,
    saved: active.filter(i => i.saved).length,
    byCategory: Object.values(byCat).map(c => ({ category: c.category, count: c.count, avg_relevance: c.count > 0 ? c.totalRel / c.count : 0 })),
  };
}

export function getFeedHealth() {
  return store.feeds.map(f => {
    const fi = store.items.filter(i => i.feed_id === f.id && !i.dismissed);
    const avgRel = fi.length > 0 ? fi.reduce((s, i) => s + i.relevance, 0) / fi.length : 0;

    // Sort by publish date descending to compute cadence
    const sorted = fi.map(i => new Date(i.published).getTime()).filter(t => !isNaN(t)).sort((a, b) => b - a);
    const latest = sorted.length > 0 ? new Date(sorted[0]).toISOString() : null;

    // Compute typical posting interval from gaps between consecutive items
    let avg_interval_hours = null;
    if (sorted.length >= 2) {
      const gaps = [];
      for (let i = 0; i < Math.min(sorted.length - 1, 20); i++) {
        gaps.push((sorted[i] - sorted[i + 1]) / 3600000);
      }
      avg_interval_hours = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    }

    // Determine health status:
    //   "error"   (red)   — feed has fetch errors
    //   "delayed" (amber) — unusually long gap since last post relative to cadence
    //   "ok"      (green) — normal, or last post < 5 days ago regardless
    //   "unknown" (gray)  — no items yet
    const hours_since_last = latest ? (Date.now() - new Date(latest).getTime()) / 3600000 : null;
    let health_status = "ok";
    if (f.last_error) {
      health_status = "error";
    } else if (hours_since_last === null) {
      health_status = "unknown";
    } else if (hours_since_last <= 120) {
      // Last post within 5 days — always green
      health_status = "ok";
    } else if (avg_interval_hours !== null) {
      // Compare gap to typical cadence — only amber, never red for cadence
      if (hours_since_last > avg_interval_hours * 3) health_status = "delayed";
    } else {
      // Only 1 item, fall back to simple threshold
      if (hours_since_last > 168) health_status = "delayed";
    }

    return {
      ...f, live_items: fi.length, latest_item: latest, computed_avg_relevance: avgRel,
      avg_interval_hours, hours_since_last, health_status,
    };
  });
}

export function getUnscoredItems(limit = 200) {
  return store.items
    .filter(i => !i.dismissed && i.relevance === 0.5 && !i.scored_at && !i.relevance_reason)
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .slice(0, limit);
}

export function addSuggestion(s) {
  // Dedup: skip if a suggestion with the same URL already exists (any status) or a feed with the same URL exists
  if (s.url && store.suggestions.some(x => x.url === s.url)) return null;
  if (s.url && store.feeds.some(f => f.url === s.url)) return null;
  const id = parseInt(crypto.randomBytes(6).toString("hex"), 16);
  store.suggestions.push({ ...s, id, status: "pending", created_at: new Date().toISOString() });
  save();
  return id;
}
export function getSuggestions() { return store.suggestions.filter(s => s.status === "pending"); }
export function getSuggestionById(id) { return store.suggestions.find(s => s.id === id) || null; }
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

export function resetScores() {
  let count = 0;
  for (const item of store.items) {
    if (item.scored_at) {
      item.relevance = 0.5;
      item.relevance_reason = null;
      item.scored_at = null;
      item.affiliations = [];
      item.tags = [];
      count++;
    }
  }
  if (count > 0) save();
  return { count };
}

export function cleanupOldItems(daysToKeep = 7) {
  const before = store.items.length;
  if (daysToKeep === 0) {
    // Clear all non-saved items
    store.items = store.items.filter(i => i.saved);
  } else {
    const cutoff = new Date(Date.now() - daysToKeep * 86400000).toISOString();
    store.items = store.items.filter(i => i.saved || i.published > cutoff);
  }
  if (before !== store.items.length) save();
  return { changes: before - store.items.length };
}

export default store;
