import Parser from "rss-parser";
import crypto from "crypto";
import { upsertItem, updateFeedStatus, getActiveFeeds } from "./db.js";

const rssParser = new Parser({
  timeout: 15000,
  maxRedirects: 3,
  headers: {
    "User-Agent": "AI-Intel-Hub/1.0 (Feed Aggregator)",
    Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml",
  },
  customFields: {
    item: [["dc:creator", "creator"], ["content:encoded", "contentEncoded"]],
  },
});

// ── Category inference from feed config ─────────────────────────────────────
function inferCategory(feed) {
  return feed.category || "research";
}

// ── Generate stable item ID ─────────────────────────────────────────────────
function makeItemId(feedId, item) {
  const raw = item.guid || item.link || item.title || "";
  return crypto.createHash("sha256").update(`${feedId}:${raw}`).digest("hex").slice(0, 16);
}

// ── Extract summary from content ────────────────────────────────────────────
function extractSummary(item) {
  const raw = item.contentSnippet || item.contentEncoded || item.content || item.summary || "";
  // Strip HTML and truncate
  const text = raw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length > 600 ? text.slice(0, 597) + "..." : text;
}

// ── Fetch a single RSS feed ─────────────────────────────────────────────────
async function fetchRSSFeed(feed) {
  const result = { items: [], error: null };

  try {
    const parsed = await rssParser.parseURL(feed.url);
    const category = inferCategory(feed);

    for (const entry of (parsed.items || []).slice(0, 50)) {
      const itemId = makeItemId(feed.id, entry);
      const published = entry.isoDate || entry.pubDate || new Date().toISOString();

      result.items.push({
        id: itemId,
        feedId: feed.id,
        title: (entry.title || "Untitled").trim(),
        summary: extractSummary(entry),
        url: entry.link || "",
        author: entry.creator || entry.author || "",
        published,
        category,
        relevance: 0.5, // default; will be scored by LLM
        relevanceReason: null,
        tags: extractTags(entry, category),
      });
    }
  } catch (err) {
    result.error = err.message;
    console.error(`[Fetcher] Error fetching ${feed.name}: ${err.message}`);
  }

  return result;
}

// ── Simple tag extraction from content ──────────────────────────────────────
function extractTags(entry, category) {
  const tags = new Set();
  const text = `${entry.title || ""} ${entry.contentSnippet || ""}`.toLowerCase();

  const tagPatterns = {
    agents: /\bagent[s]?\b|agentic/,
    llm: /\bllm[s]?\b|language model/,
    rag: /\brag\b|retrieval.augmented/,
    mcp: /\bmcp\b|model context protocol/,
    reasoning: /\breason(ing)?\b|chain.of.thought/,
    safety: /\bsafety\b|alignment|guardrail/,
    governance: /\bgovernance\b|regulation|regulatory/,
    "eu-ai-act": /\beu ai act\b|ai act/,
    "open-source": /open.?source|open.?weight/,
    benchmark: /\bbenchmark\b|eval(uation)?/,
    fine_tuning: /fine.?tun(e|ing)/,
    inference: /\binference\b|serving/,
    coding: /\bcod(e|ing)\b|software engineer/,
    multimodal: /\bmultimodal\b|vision|image/,
    robotics: /\brobot(ics)?\b|embodied/,
    quantum: /\bquantum\b/,
    enterprise: /\benterprise\b/,
    startup: /\bstartup\b|funding|raised/,
    china: /\bchina|chinese|baidu|alibaba|tencent|deepseek|qwen\b/,
  };

  for (const [tag, pattern] of Object.entries(tagPatterns)) {
    if (pattern.test(text)) tags.add(tag);
  }

  // Add category-based tags
  if (entry.categories) {
    for (const cat of entry.categories) {
      if (typeof cat === "string") tags.add(cat.toLowerCase().replace(/\s+/g, "-").slice(0, 30));
    }
  }

  return [...tags].slice(0, 8);
}

// ── Fetch all active feeds ──────────────────────────────────────────────────
export async function fetchAllFeeds() {
  const feeds = getActiveFeeds().filter((f) => f.type === "rss");
  console.log(`[Fetcher] Refreshing ${feeds.length} RSS feeds...`);

  const results = { totalNew: 0, totalErrors: 0, feeds: [] };

  // Process feeds with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    const batch = feeds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (feed) => {
        const { items, error } = await fetchRSSFeed(feed);

        let newCount = 0;
        for (const item of items) {
          try {
            const result = upsertItem(item);
            if (result.changes > 0) newCount++;
          } catch (err) {
            // Likely duplicate, skip
          }
        }

        const avgRelevance = items.length > 0
          ? items.reduce((s, i) => s + i.relevance, 0) / items.length
          : null;

        updateFeedStatus(feed.id, {
          lastFetched: new Date().toISOString(),
          lastError: error,
          itemCount: items.length,
          avgRelevance,
        });

        return { feedId: feed.id, name: feed.name, newItems: newCount, error };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.feeds.push(r.value);
        results.totalNew += r.value.newItems;
        if (r.value.error) results.totalErrors++;
      } else {
        results.totalErrors++;
      }
    }
  }

  console.log(
    `[Fetcher] Done. ${results.totalNew} new items, ${results.totalErrors} errors.`
  );
  return results;
}

// ── Fetch single feed (for manual refresh) ──────────────────────────────────
export async function fetchSingleFeed(feedId) {
  const feeds = getActiveFeeds();
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) throw new Error(`Feed not found: ${feedId}`);
  if (feed.type !== "rss") throw new Error(`Feed type ${feed.type} not supported for auto-fetch`);

  const { items, error } = await fetchRSSFeed(feed);
  let newCount = 0;
  for (const item of items) {
    try {
      const result = upsertItem(item);
      if (result.changes > 0) newCount++;
    } catch (err) { /* skip */ }
  }

  updateFeedStatus(feed.id, {
    lastFetched: new Date().toISOString(),
    lastError: error,
    itemCount: items.length,
  });

  return { feedId, name: feed.name, newItems: newCount, totalItems: items.length, error };
}
