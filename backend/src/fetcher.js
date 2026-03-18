import Parser from "rss-parser";
import crypto from "crypto";
import { upsertItem, updateFeedStatus, getActiveFeeds, getItems } from "./db.js";

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

// ── Validate a feed URL (cached) ────────────────────────────────────────────
export async function validateFeedUrl(url) {
  const cached = cacheGet(`validate:${url}`);
  if (cached !== undefined) return cached;

  let result;
  try {
    const parsed = await rssParser.parseURL(url);
    const itemCount = (parsed.items || []).length;
    result = { valid: true, title: parsed.title || null, itemCount };
  } catch (err) {
    result = { valid: false, error: err.message };
  }
  cacheSet(`validate:${url}`, result);
  return result;
}

// ── YouTube channel fetcher ──────────────────────────────────────────────────

// Resolve a YouTube @handle URL to { rssUrl, title, channelId }
export async function resolveYouTubeChannel(url) {
  const rssUrl = await resolveYouTubeRSS(url);
  if (!rssUrl) return null;
  try {
    const parsed = await rssParser.parseURL(rssUrl);
    return { rssUrl, title: parsed.title || null, channelId: rssUrl.match(/channel_id=([\w-]+)/)?.[1] };
  } catch { return { rssUrl, title: null, channelId: null }; }
}

// Resolves @handle or /channel/ URLs to the channel's RSS feed URL.
async function resolveYouTubeRSS(url) {
  // Already an RSS feed URL
  if (url.includes("/feeds/videos.xml")) return url;

  // Extract channel ID from /channel/UCXXXX format
  const channelMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (channelMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;

  // For @handle URLs, fetch the page and extract the channel ID from metadata
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AI-Intel-Hub/1.0 (Feed Aggregator)" },
      redirect: "follow",
    });
    const html = await res.text();
    // Look for channel ID in the page source
    const cidMatch = html.match(/(?:"channelId"|"externalChannelId"|channel_id=)([":])(UC[\w-]+)/);
    if (cidMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${cidMatch[2]}`;
    // Fallback: look for canonical URL with channel ID
    const canonMatch = html.match(/\/channel\/(UC[\w-]+)/);
    if (canonMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${canonMatch[1]}`;
  } catch (e) {
    console.error(`[Fetcher] YouTube resolve failed for ${url}: ${e.message}`);
  }
  return null;
}

// Scrape rich metadata from a YouTube video page: description, duration, views, keywords.
// No API key needed — extracts from the page's embedded JSON.
async function scrapeVideoMetadata(videoUrl) {
  try {
    const res = await fetch(videoUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Intel-Hub/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    // Extract full description from YouTube's embedded JSON
    let description = "";
    const sdMatch = html.match(/"shortDescription":"(.*?(?:\\.|[^"])*)"/);
    if (sdMatch) {
      description = sdMatch[1]
        .replace(/\\n/g, " ")
        .replace(/\\u0026/g, "&")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/https?:\/\/\S+/g, "") // strip URLs
        .replace(/_{3,}/g, " ")          // strip separators
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 500);
    }
    // Fallback to og:description
    if (!description) {
      const ogMatch = html.match(/<meta\s+(?:property="og:description"|name="description")\s+content="([^"]*?)"/i);
      if (ogMatch) description = ogMatch[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 500);
    }

    // Duration
    const durMatch = html.match(/"lengthSeconds":"(\d+)"/);
    const durationMin = durMatch ? Math.round(parseInt(durMatch[1]) / 60) : null;

    // View count
    const viewsMatch = html.match(/"viewCount":"(\d+)"/);
    const views = viewsMatch ? parseInt(viewsMatch[1]) : null;

    // Keywords/tags
    const kwMatch = html.match(/"keywords":\[(.*?)\]/);
    const keywords = kwMatch
      ? kwMatch[1].replace(/"/g, "").split(",").map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [];

    return { description, durationMin, views, keywords };
  } catch {
    return { description: "", durationMin: null, views: null, keywords: [] };
  }
}

async function fetchYouTubeFeed(feed) {
  const result = { items: [], error: null };
  try {
    const rssUrl = await resolveYouTubeRSS(feed.url);
    if (!rssUrl) {
      result.error = "Could not resolve YouTube channel RSS feed";
      return result;
    }

    const parsed = await rssParser.parseURL(rssUrl);
    const category = inferCategory(feed);
    const channelName = parsed.title || feed.name || "YouTube";
    const entries = (parsed.items || []).slice(0, 20);

    // Scrape rich metadata from video pages (top 10, concurrent)
    const metadataMap = new Map();
    const toScrape = entries.slice(0, 10);
    const scrapeResults = await Promise.allSettled(
      toScrape.map(async (entry) => {
        const videoUrl = entry.link;
        if (!videoUrl) return null;
        const meta = await scrapeVideoMetadata(videoUrl);
        return { link: videoUrl, meta };
      })
    );
    for (const r of scrapeResults) {
      if (r.status === "fulfilled" && r.value?.meta) {
        metadataMap.set(r.value.link, r.value.meta);
      }
    }

    for (const entry of entries) {
      const itemId = makeItemId(feed.id, entry);
      const published = entry.isoDate || entry.pubDate || new Date().toISOString();
      const videoId = entry.id?.replace("yt:video:", "") || "";
      const videoUrl = entry.link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
      const meta = metadataMap.get(videoUrl) || {};

      // Build a rich summary: duration + views + description
      const parts = [];
      if (meta.durationMin) parts.push(`${meta.durationMin} min`);
      if (meta.views) parts.push(`${meta.views.toLocaleString()} views`);
      const prefix = parts.length > 0 ? `[${parts.join(" · ")}] ` : "";
      const description = meta.description || extractSummary(entry) || "";
      const summary = description
        ? `${prefix}${description}`
        : `${prefix}Video from ${channelName}`;

      // Merge scraped keywords with tag extraction
      const tags = [...new Set([
        ...extractTags(entry, category),
        ...(meta.keywords || []),
        "video",
      ])].slice(0, 10);

      result.items.push({
        id: itemId,
        feedId: feed.id,
        title: (entry.title || "Untitled").trim(),
        summary,
        url: videoUrl,
        author: entry.author || channelName,
        published,
        category,
        relevance: 0.5,
        relevanceReason: null,
        tags,
      });
    }
    console.log(`[Fetcher] YouTube ${feed.name}: ${result.items.length} videos (${metadataMap.size} with metadata)`);
  } catch (err) {
    result.error = err.message;
    console.error(`[Fetcher] Error fetching YouTube ${feed.name}: ${err.message}`);
  }
  return result;
}

// ── Fetch all active feeds ──────────────────────────────────────────────────
export async function fetchAllFeeds() {
  const feeds = getActiveFeeds().filter((f) => f.type === "rss" || f.type === "youtube");
  console.log(`[Fetcher] Refreshing ${feeds.length} feeds...`);

  const results = { totalNew: 0, totalErrors: 0, feeds: [] };

  // Process feeds with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    const batch = feeds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (feed) => {
        const { items, error } = feed.type === "youtube"
          ? await fetchYouTubeFeed(feed)
          : await fetchRSSFeed(feed);

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
  if (feed.type !== "rss" && feed.type !== "youtube") throw new Error(`Feed type ${feed.type} not supported for auto-fetch`);

  const { items, error } = feed.type === "youtube"
    ? await fetchYouTubeFeed(feed)
    : await fetchRSSFeed(feed);
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

// ── Feed Discovery ──────────────────────────────────────────────────────────

// TTL cache for feed validation and domain probe results.
// Avoids re-probing the same URLs/domains across repeated health checks.
const _cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return undefined; }
  return entry.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, ts: Date.now() });
  // Evict old entries periodically
  if (_cache.size > 500) {
    const cutoff = Date.now() - CACHE_TTL;
    for (const [k, v] of _cache) { if (v.ts < cutoff) _cache.delete(k); }
  }
}

const COMMON_FEED_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/blog/feed", "/atom.xml", "/blog/rss", "/index.xml"];
const DOMAIN_BLOCKLIST = new Set(["twitter.com", "x.com", "t.co", "github.com", "youtube.com", "reddit.com", "bit.ly", "medium.com", "news.google.com", "google.com", "arxiv.org", "doi.org", "dx.doi.org", "en.wikipedia.org", "linkedin.com", "facebook.com"]);
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch { return null; }
}

async function probeFeedUrls(domain) {
  const cached = cacheGet(`probe:${domain}`);
  if (cached !== undefined) return cached;

  // Try all common paths in parallel, return first valid result
  const results = await Promise.allSettled(
    COMMON_FEED_PATHS.map(async (path) => {
      const url = `https://${domain}${path}`;
      const result = await validateFeedUrl(url);
      if (!result.valid) throw new Error(result.error);
      return { url, title: result.title };
    })
  );
  let found = null;
  for (const r of results) {
    if (r.status === "fulfilled") { found = r.value; break; }
  }
  cacheSet(`probe:${domain}`, found);
  return found;
}

// Run a function with a deadline — returns whatever completed before timeout
function withDeadline(fn, ms) {
  return Promise.race([
    fn(),
    new Promise(resolve => setTimeout(() => resolve([]), ms)),
  ]);
}

/**
 * Strategy 1: Mine links from existing feed content to discover new sources.
 * Results are cached for 1 hour to avoid redundant probing.
 */
export async function discoverFeedsFromContent() {
  const cached = cacheGet("discovery:content");
  if (cached !== undefined) { console.log("[Discovery] Link mining: returning cached results"); return cached; }

  const items = getItems({ limit: 500 });
  const subscribedDomains = new Set(getActiveFeeds().map(f => extractDomain(f.url)).filter(Boolean));

  // Count domain references across all items
  const domainCounts = new Map();
  for (const item of items) {
    const urls = new Set();
    if (item.url) urls.add(item.url);
    // Extract URLs from summary text
    const matches = (item.summary || "").match(URL_REGEX) || [];
    for (const m of matches) urls.add(m);

    for (const url of urls) {
      const domain = extractDomain(url);
      if (!domain || DOMAIN_BLOCKLIST.has(domain) || subscribedDomains.has(domain)) continue;
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }
  }

  // Sort by reference count, take top 15
  const topDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log(`[Discovery] Link mining: found ${domainCounts.size} unique domains, probing top ${topDomains.length}`);

  // Probe for RSS feeds with 30s deadline
  const results = await withDeadline(async () => {
    const discovered = [];
    // Process in batches of 3 to limit concurrency
    for (let i = 0; i < topDomains.length; i += 3) {
      const batch = topDomains.slice(i, i + 3);
      const probes = await Promise.allSettled(
        batch.map(async ([domain, count]) => {
          const feed = await probeFeedUrls(domain);
          if (feed) return { url: feed.url, domain, title: feed.title, referenceCount: count, source: "link-mining" };
          return null;
        })
      );
      for (const r of probes) {
        if (r.status === "fulfilled" && r.value) discovered.push(r.value);
      }
    }
    return discovered;
  }, 30000);

  console.log(`[Discovery] Link mining: discovered ${results.length} feeds`);
  cacheSet("discovery:content", results);
  return results;
}

// Map well-known publisher names to their blog domains
const PUBLISHER_DOMAINS = {
  "techcrunch": "techcrunch.com", "wired": "wired.com", "the verge": "theverge.com",
  "ars technica": "arstechnica.com", "mit technology review": "technologyreview.com",
  "venturebeat": "venturebeat.com", "the register": "theregister.com",
  "zdnet": "zdnet.com", "engadget": "engadget.com", "ieee spectrum": "spectrum.ieee.org",
  "nature": "nature.com", "science": "science.org",
};

/**
 * Strategy 2: Search Google News RSS for emerging AI sources.
 * Uses publisher names from Google News results, maps to domains, probes for RSS.
 * Results are cached for 1 hour.
 */
export async function discoverFeedsFromSearch() {
  const cached = cacheGet("discovery:search");
  if (cached !== undefined) { console.log("[Discovery] Web search: returning cached results"); return cached; }
  const searchParser = new Parser({
    timeout: 10000,
    customFields: { item: ["source"] },
  });

  const queries = [
    "AI artificial intelligence blog",
    "AI startup funding 2026",
    "machine learning engineering",
    "AI governance regulation",
    "AI research lab",
  ];

  const subscribedDomains = new Set(getActiveFeeds().map(f => extractDomain(f.url)).filter(Boolean));
  const sourceCounts = new Map(); // publisher name -> count

  console.log(`[Discovery] Web search: running ${queries.length} queries`);

  const queryResults = await Promise.allSettled(
    queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const parsed = await searchParser.parseURL(url);
      return (parsed.items || []).map(item => item.source).filter(Boolean);
    })
  );

  for (const r of queryResults) {
    if (r.status !== "fulfilled") continue;
    for (const source of r.value) {
      const name = (typeof source === "string" ? source : source._ || source.$?.url || "").trim();
      if (!name) continue;
      sourceCounts.set(name, (sourceCounts.get(name) || 0) + 1);
    }
  }

  // Convert publisher names to candidate domains
  const candidateDomains = new Map();
  for (const [name, count] of sourceCounts) {
    const lower = name.toLowerCase();
    // Check known mapping first
    let domain = PUBLISHER_DOMAINS[lower];
    if (!domain) {
      // Guess domain: "Acme Corp Blog" -> "acmecorp.com"
      const slug = lower.replace(/\s+(blog|news|ai|tech|magazine|journal)$/i, "").replace(/[^a-z0-9]+/g, "");
      domain = `${slug}.com`;
    }
    if (DOMAIN_BLOCKLIST.has(domain) || subscribedDomains.has(domain)) continue;
    if (!candidateDomains.has(domain) || candidateDomains.get(domain).count < count) {
      candidateDomains.set(domain, { name, count });
    }
  }

  const topDomains = [...candidateDomains.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([domain, { name, count }]) => [domain, count]);

  console.log(`[Discovery] Web search: ${sourceCounts.size} publishers -> ${candidateDomains.size} domains, probing top ${topDomains.length}`);

  // Probe for RSS feeds with 30s deadline
  const results = await withDeadline(async () => {
    const discovered = [];
    for (let i = 0; i < topDomains.length; i += 3) {
      const batch = topDomains.slice(i, i + 3);
      const probes = await Promise.allSettled(
        batch.map(async ([domain, count]) => {
          const feed = await probeFeedUrls(domain);
          if (feed) return { url: feed.url, domain, title: feed.title, referenceCount: count, source: "web-search" };
          return null;
        })
      );
      for (const r of probes) {
        if (r.status === "fulfilled" && r.value) discovered.push(r.value);
      }
    }
    return discovered;
  }, 30000);

  console.log(`[Discovery] Web search: discovered ${results.length} feeds`);
  cacheSet("discovery:search", results);
  return results;
}
