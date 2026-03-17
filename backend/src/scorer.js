import { getItems, upsertItem, cacheAnalysis, getCachedAnalysis } from "./db.js";
import { discoverFeedsFromContent, discoverFeedsFromSearch } from "./fetcher.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

function getApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function getRelevanceContext() {
  return (
    process.env.RELEVANCE_CONTEXT ||
    "Senior technology executive at a major bank focused on AI strategy, architecture, and governance."
  );
}

function getScoringInstructions() {
  return process.env.SCORING_INSTRUCTIONS || "";
}

// ── Call Claude API ─────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMessage, maxTokens = 1500) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === "sk-ant-your-key-here") {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

// ── Score a batch of items for relevance ─────────────────────────────────────
export async function scoreItems(items) {
  if (items.length === 0) return [];

  const context = getRelevanceContext();
  const instructions = getScoringInstructions();
  const systemPrompt = `You are a relevance scoring engine for an AI intelligence feed.
The reader is: ${context}
${instructions ? `\nAdditional scoring instructions: ${instructions}\n` : ""}
Score each item from 0.0 to 1.0 for relevance to this reader. Also provide a brief reason (one sentence) explaining why it matters to them specifically.

Respond ONLY with a JSON array of objects: [{"id": "...", "relevance": 0.85, "reason": "...", "tags": ["tag1", "tag2"]}]
No other text. Valid JSON only.`;

  const itemList = items.map((i) => ({
    id: i.id,
    title: i.title,
    summary: (i.summary || "").slice(0, 200),
    source: i.feedId,
    category: i.category,
  }));

  try {
    const result = await callClaude(
      systemPrompt,
      `Score these items:\n${JSON.stringify(itemList, null, 2)}`,
      2000
    );

    // Parse JSON from response, handling potential markdown fencing
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const scores = JSON.parse(cleaned);

    // Apply scores back to items
    const scoreMap = new Map(scores.map((s) => [s.id, s]));
    const updated = [];

    for (const item of items) {
      const score = scoreMap.get(item.id);
      if (score) {
        const updatedItem = {
          ...item,
          relevance: Math.max(0, Math.min(1, score.relevance)),
          relevanceReason: score.reason || null,
          scored_at: new Date().toISOString(),
          tags: [...new Set([...(item.tags || []), ...(score.tags || [])])].slice(0, 10),
        };
        upsertItem(updatedItem);
        updated.push(updatedItem);
      }
    }

    console.log(`[Scorer] Scored ${updated.length}/${items.length} items`);
    return updated;
  } catch (err) {
    console.error(`[Scorer] Error scoring items: ${err.message}`);
    return items; // Return unscored
  }
}

// ── Score unscored items in batches ─────────────────────────────────────────
export async function scoreUnscoredItems(batchSize = 15) {
  // Get items with default relevance (0.5 = unscored)
  const items = getItems({ minRelevance: 0, limit: 200 });
  const unscored = items.filter(
    (i) => i.relevance === 0.5 && !i.relevanceReason
  );

  if (unscored.length === 0) {
    console.log("[Scorer] No unscored items found");
    return { scored: 0 };
  }

  console.log(`[Scorer] Found ${unscored.length} unscored items, processing in batches of ${batchSize}`);
  let totalScored = 0;

  for (let i = 0; i < unscored.length; i += batchSize) {
    const batch = unscored.slice(i, i + batchSize);
    const scored = await scoreItems(batch);
    totalScored += scored.length;

    // Rate limit: wait between batches
    if (i + batchSize < unscored.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return { scored: totalScored, total: unscored.length };
}

// ── Generate analysis briefing ──────────────────────────────────────────────
export async function generateAnalysis(mode, category = null) {
  // Check cache first
  const cached = getCachedAnalysis(mode, category, 30);
  if (cached) {
    return { result: cached.result, cached: true };
  }

  const items = getItems({
    category: category || "all",
    minRelevance: 0.3,
    limit: 20,
  });

  if (items.length === 0) {
    return { result: "No items available for analysis. Try refreshing your feeds first.", cached: false };
  }

  const context = getRelevanceContext();
  const sourceItems = items.slice(0, 15);
  const itemSummaries = sourceItems
    .map(
      (it, i) =>
        `${i + 1}. [${it.category}] ${it.title}\n   URL: ${it.url || "none"}\n   Source: ${it.feed_id} | Relevance: ${(it.relevance * 100).toFixed(0)}%\n   ${(it.summary || "").slice(0, 200)}`
    )
    .join("\n\n");

  const citationRule = `\nIMPORTANT: For each key insight or claim, cite the source item(s) that inform it using markdown links: [short title](URL). Every bullet point or paragraph that draws on a specific item must include at least one source link.`;

  const prompts = {
    briefing: {
      system: `You are an AI intelligence analyst for: ${context}\nProduce concise, actionable briefings. No preamble.`,
      user: `Produce an executive briefing (300-400 words) from these recent items. Structure as:

**CRITICAL DEVELOPMENTS** (items requiring immediate attention or action)
**STRATEGIC SIGNALS** (emerging patterns, shifts, or trends to monitor)
**ACTION ITEMS** (specific things to investigate, prototype, escalate, or dismiss)
${citationRule}
Items:\n${itemSummaries}`,
    },
    gaps: {
      system: `You are an AI intelligence feed curator for: ${context}\nIdentify coverage gaps and suggest improvements.`,
      user: `Review these feed items and identify:

**COVERAGE GAPS** - Important AI topics NOT represented (hardware/chips, specific jurisdictions, emerging players, technical domains)
**PERSPECTIVE BIAS** - Is the feed skewed toward particular viewpoints? Missing contrarian or critical voices?
**SUGGESTED ADDITIONS** - Recommend 5 specific new sources with URLs where possible (substacks, blogs, X accounts, newsletters)
${citationRule}
Items:\n${itemSummaries}`,
    },
    risks: {
      system: `You are an AI risk analyst for: ${context}\nFocus on actionable risk intelligence.`,
      user: `Produce a focused risk assessment from these items:

**REGULATORY RISKS** - Upcoming deadlines, new guidance, enforcement actions, compliance implications
**TECHNOLOGY RISKS** - Capability shifts that could disrupt current architecture decisions or strategy
**VENDOR RISKS** - Competitive landscape changes affecting platform and model provider decisions
**OPERATIONAL RISKS** - Workforce, security, process, or organizational implications
${citationRule}
Items:\n${itemSummaries}`,
    },
    "what-so-what-now-what": {
      system: `You are a strategic advisor for: ${context}\nUse the What/So What/Now What framework.`,
      user: `For each of the 3-5 most significant items, provide:

**WHAT** - What changed? (Factual: new capability, regulation, risk, or market shift)
**SO WHAT** - Why does it matter? (Implication for architecture, strategy, governance, competitive position)
**NOW WHAT** - What should be done? (Prototype, escalate, monitor, dismiss — and who should own it)
${citationRule}
Items:\n${itemSummaries}`,
    },
  };

  const prompt = prompts[mode];
  if (!prompt) throw new Error(`Unknown analysis mode: ${mode}`);

  try {
    const result = await callClaude(prompt.system, prompt.user, 2000);
    const itemIds = items.map((i) => i.id);
    cacheAnalysis(mode, category, result, itemIds);
    return { result, cached: false };
  } catch (err) {
    throw new Error(`Analysis failed: ${err.message}`);
  }
}

// ── Detect stale/noisy feeds and suggest improvements ───────────────────────

// In-memory cache for feed health analysis results (30 min TTL)
let _healthCache = { result: null, ts: 0 };
const HEALTH_CACHE_TTL = 30 * 60 * 1000;

// Curated pool of known-good feeds as a baseline
const CURATED_FEEDS = [
  { name: "JMLR", url: "https://jmlr.org/jmlr.xml", category: "research" },
  { name: "Berkeley AI Research (BAIR)", url: "https://bair.berkeley.edu/blog/feed.xml", category: "research" },
  { name: "Alignment Forum", url: "https://www.alignmentforum.org/feed.xml", category: "research" },
  { name: "LessWrong AI", url: "https://www.lesswrong.com/feed.xml?view=community-rss&karmaThreshold=30", category: "research" },
  { name: "AWS Machine Learning", url: "https://aws.amazon.com/blogs/machine-learning/feed/", category: "engineering" },
  { name: "Databricks Blog", url: "https://www.databricks.com/feed", category: "engineering" },
  { name: "Replicate Blog", url: "https://replicate.com/blog/rss", category: "engineering" },
  { name: "The Pragmatic Engineer", url: "https://newsletter.pragmaticengineer.com/feed", category: "engineering" },
  { name: "Not Boring", url: "https://www.notboring.co/feed", category: "industry" },
  { name: "Newcomer", url: "https://www.newcomer.co/feed", category: "industry" },
  { name: "Sequoia Capital", url: "https://www.sequoiacap.com/feed/", category: "industry" },
  { name: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/blog/feed/", category: "labs" },
  { name: "Apple Machine Learning", url: "https://machinelearning.apple.com/rss.xml", category: "labs" },
  { name: "EleutherAI", url: "https://blog.eleuther.ai/rss/", category: "labs" },
  { name: "Brookings AI", url: "https://www.brookings.edu/topic/artificial-intelligence/feed/", category: "policy" },
  { name: "Ada Lovelace Institute", url: "https://www.adalovelaceinstitute.org/feed/", category: "policy" },
  { name: "Partnership on AI", url: "https://partnershiponai.org/feed/", category: "policy" },
  { name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", category: "policy" },
];

export async function analyzeFeedHealth(feedHealth) {
  // Return cached result if still fresh
  if (_healthCache.result && (Date.now() - _healthCache.ts) < HEALTH_CACHE_TTL) {
    console.log("[Health] Returning cached analysis (< 30 min old)");
    return _healthCache.result;
  }

  const context = getRelevanceContext();
  const feedSummary = feedHealth
    .map(
      (f) =>
        `- ${f.name} [${f.category}/${f.type}]: ${f.live_items} items, avg relevance ${((f.computed_avg_relevance || 0) * 100).toFixed(0)}%, latest: ${f.latest_item || "never"}`
    )
    .join("\n");

  // Run both discovery strategies in parallel before calling Claude
  console.log("[Health] Running feed discovery...");
  const [linkResults, searchResults] = await Promise.allSettled([
    discoverFeedsFromContent(),
    discoverFeedsFromSearch(),
  ]);

  const linkMined = linkResults.status === "fulfilled" ? linkResults.value : [];
  const searchFound = searchResults.status === "fulfilled" ? searchResults.value : [];
  if (linkResults.status === "rejected") console.error("[Health] Link mining failed:", linkResults.reason?.message);
  if (searchResults.status === "rejected") console.error("[Health] Web search failed:", searchResults.reason?.message);

  // Merge discovered feeds, dedup by domain
  const seen = new Set();
  const discovered = [];
  for (const d of [...linkMined, ...searchFound]) {
    const domain = new URL(d.url).hostname.replace(/^www\./, "");
    if (seen.has(domain)) continue;
    seen.add(domain);
    discovered.push(d);
  }

  // Filter out already-subscribed URLs
  const subscribedUrls = new Set(feedHealth.map(f => f.url));
  const novelDiscoveries = discovered.filter(d => !subscribedUrls.has(d.url));

  // Also filter curated feeds against subscribed
  const novelCurated = CURATED_FEEDS.filter(f => !subscribedUrls.has(f.url));

  // Build candidate sections for the prompt
  let discoveredSection = "";
  if (novelDiscoveries.length > 0) {
    discoveredSection = "\nDISCOVERED FEEDS (automatically found — these are verified working RSS feeds):\n" +
      novelDiscoveries.map(d =>
        `  - ${d.title || d.domain} [${d.source}]: ${d.url} (referenced ${d.referenceCount}x)`
      ).join("\n");
  }

  let curatedSection = "";
  if (novelCurated.length > 0) {
    curatedSection = "\nCURATED FEEDS (verified working RSS URLs):\n" +
      novelCurated.map(f => `  - ${f.name} [${f.category}]: ${f.url}`).join("\n");
  }

  console.log(`[Health] ${novelDiscoveries.length} discovered + ${novelCurated.length} curated candidates for Claude`);

  const systemPrompt = `You are a feed curation advisor for: ${context}
Analyze feed health and suggest new RSS feeds. Respond in JSON format only.`;

  const categories = "research, engineering, industry, policy, labs";
  const userMessage = `Analyze these feeds and suggest improvements. Respond with JSON:
{
  "stale": [{"id": "feed-id", "reason": "why it appears stale"}],
  "noisy": [{"id": "feed-id", "reason": "why it has low relevance"}],
  "suggestions": [{"name": "...", "url": "...", "type": "rss", "category": "...", "reason": "..."}]
}

IMPORTANT for suggestions:
- Pick 2-3 feeds per category (${categories}) from the DISCOVERED FEEDS and CURATED FEEDS lists below — aim for 10-15 total
- Prefer DISCOVERED FEEDS (they are novel, emerging sources) over curated ones
- ONLY use exact URLs from the lists below — do NOT invent or guess URLs
- Do NOT suggest feeds already subscribed (listed under "Current feeds")
- Each suggestion MUST have a category from: ${categories}
- Explain why each feed is relevant to the user's context
${discoveredSection}
${curatedSection}

Current feeds:\n${feedSummary}`;

  try {
    const result = await callClaude(systemPrompt, userMessage, 3000);
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    _healthCache = { result: parsed, ts: Date.now() };
    return parsed;
  } catch (err) {
    console.error(`[Health] Feed health analysis failed: ${err.message}`);
    return { stale: [], noisy: [], suggestions: [] };
  }
}
