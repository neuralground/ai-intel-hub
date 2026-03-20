import { getItems, getUnscoredItems, upsertItem, cacheAnalysis, getCachedAnalysis, getAllFeeds } from "./db.js";
import { discoverFeedsFromContent, discoverFeedsFromSearch } from "./fetcher.js";
import { getFeedOrg, getOrgNamesForPrompt, getOrgLabels } from "./orgs.js";

// ── LLM Provider Configuration ──────────────────────────────────────────────

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.2",
};

function getProvider() {
  return process.env.LLM_PROVIDER || "anthropic";
}

function getModel() {
  return process.env.LLM_MODEL || DEFAULT_MODELS[getProvider()] || DEFAULT_MODELS.anthropic;
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

// ── Provider-specific API calls ─────────────────────────────────────────────

async function callAnthropic(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-your-key-here") {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = getModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOllama(systemPrompt, userMessage, maxTokens) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getModel(),
      stream: false,
      options: { num_predict: maxTokens },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${errBody}`);
  }
  const data = await response.json();
  return data.message?.content || "";
}

// ── Unified LLM call ────────────────────────────────────────────────────────

const PROVIDERS = { anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini, ollama: callOllama };

async function callLLM(systemPrompt, userMessage, maxTokens = 1500) {
  const provider = getProvider();
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown LLM provider: ${provider}`);
  console.log(`[LLM] Using ${provider} / ${getModel()}`);
  return fn(systemPrompt, userMessage, maxTokens);
}

// Keep backward-compatible alias
const callClaude = callLLM;

// ── Score a batch of items for relevance ─────────────────────────────────────
export async function scoreItems(items) {
  if (items.length === 0) return [];

  const context = getRelevanceContext();
  const instructions = getScoringInstructions();
  const validOrgLabels = new Set(getOrgLabels());
  const systemPrompt = `You are a relevance scoring engine for an AI intelligence feed.
The reader is: ${context}
${instructions ? `\nAdditional scoring instructions: ${instructions}\n` : ""}
Score each item from 0.0 to 1.0 for relevance to this reader. Also provide a brief reason (one sentence) explaining why it matters to them specifically.

For each item, also identify any notable affiliations of the authors. If the authors field lists people from major AI labs, tech companies, or top research universities, return the organization names in an "affiliations" array. Use ONLY these recognized org names:
${getOrgNamesForPrompt()}

Only include affiliations you are confident about based on the authors listed. If no notable affiliations are identifiable, return an empty array. Do NOT guess.

Respond ONLY with a JSON array of objects: [{"id": "...", "relevance": 0.85, "reason": "...", "tags": ["tag1", "tag2"], "affiliations": ["OrgName"]}]
No other text. Valid JSON only.`;

  const itemList = items.map((i) => ({
    id: i.id,
    title: i.title,
    summary: (i.summary || "").slice(0, 200),
    authors: i.author || "",
    source: i.feedId || i.feed_id,
    category: i.category,
  }));

  try {
    const result = await callLLM(
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
        // Merge LLM-detected affiliations with feed-level org affiliation
        const feedOrg = getFeedOrg(item.feedId || item.feed_id);
        const llmAffs = (score.affiliations || []).filter(a => validOrgLabels.has(a));
        const allAffs = feedOrg
          ? [feedOrg.label, ...llmAffs.filter(a => a !== feedOrg.label)]
          : llmAffs;

        const updatedItem = {
          ...item,
          relevance: Math.max(0, Math.min(1, score.relevance)),
          relevanceReason: score.reason || null,
          scored_at: new Date().toISOString(),
          tags: [...new Set([...(item.tags || []), ...(score.tags || [])])].slice(0, 10),
          affiliations: allAffs.slice(0, 4),
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
  // Get unscored items directly (bypasses sorting/diversification/limit)
  const unscored = getUnscoredItems(200);

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
export async function generateAnalysis(mode, category = null, { force = false } = {}) {
  // Check cache first (skip if force regenerate)
  if (!force) {
    const cached = getCachedAnalysis(mode, category, 30);
    if (cached) {
      // Rebuild sourceItems from cached item IDs
      const allItems = getItems({ limit: 500 });
      const idSet = new Set(cached.item_ids || []);
      const feedNameMap = Object.fromEntries(getAllFeeds().map(f => [f.id, f.name]));
      const sourceItemMap = Object.fromEntries(
        allItems.filter(it => idSet.has(it.id)).map(it => [it.id, {
          id: it.id, title: it.title, summary: it.summary, url: it.url,
          category: it.category, relevance: it.relevance,
          relevance_reason: it.relevance_reason, feed_id: it.feed_id,
          feed_name: feedNameMap[it.feed_id] || it.feed_id,
          published: it.published, tags: it.tags, saved: it.saved,
        }])
      );
      return { result: cached.result, cached: true, generatedAt: cached.created_at, sourceItems: sourceItemMap };
    }
  }

  // Each mode uses a different item pool to reduce redundancy
  const modeItemConfig = {
    briefing: { minRelevance: 0.2, limit: 30, sliceCount: 20 },  // wider net, more items, longer view
    risks:    { minRelevance: 0.3, limit: 20, sliceCount: 15 },  // focused on recent, moderate relevance
    "what-so-what-now-what": { minRelevance: 0.5, limit: 15, sliceCount: 10 },  // only highest-signal items
  };
  const cfg = modeItemConfig[mode] || modeItemConfig.risks;

  const items = getItems({
    category: category || "all",
    minRelevance: cfg.minRelevance,
    limit: cfg.limit,
  });

  if (items.length === 0) {
    return { result: "No items available for analysis. Try refreshing your feeds first.", cached: false };
  }

  const context = getRelevanceContext();

  // For briefing/daily summary: mix the freshest items with the most significant older ones
  let sourceItems;
  if (mode === "briefing") {
    const now = Date.now();
    const fresh = items.filter(it => (now - new Date(it.published).getTime()) < 48 * 3600000);
    const older = items.filter(it => (now - new Date(it.published).getTime()) >= 48 * 3600000 && it.relevance >= 0.6);
    // Take up to 12 fresh + up to 8 high-relevance older items
    sourceItems = [...fresh.slice(0, 12), ...older.slice(0, 8)].slice(0, cfg.sliceCount);
  } else {
    sourceItems = items.slice(0, cfg.sliceCount);
  }

  const itemSummaries = sourceItems
    .map(
      (it, i) => {
        const ageHours = (Date.now() - new Date(it.published).getTime()) / 3600000;
        const ageLabel = ageHours < 24 ? `${Math.round(ageHours)}h ago` : `${Math.round(ageHours / 24)}d ago`;
        return `${i + 1}. ID: ${it.id} | [${it.category}] ${it.title}\n   URL: ${it.url || "none"}\n   Source: ${it.feed_id} | Relevance: ${(it.relevance * 100).toFixed(0)}% | Published: ${ageLabel}\n   Affiliations: ${(it.affiliations || []).join(", ") || "none"}\n   ${(it.summary || "").slice(0, 200)}`;
      }
    )
    .join("\n\n");

  const citationRule = `\nIMPORTANT: For each key insight or claim, cite the source item(s) using this exact link format: [short title](#item-ITEM_ID) where ITEM_ID is the ID shown next to each item above. Every bullet point or paragraph that draws on a specific item must include at least one such source link. Do NOT use the external URL in links — always use the #item-ID format.`;

  const prompts = {
    briefing: {
      system: `You are an AI intelligence analyst producing a daily summary for: ${context}\nProduce a comprehensive daily intelligence summary. Include both breaking developments AND significant items from the past few days that deserve attention. No preamble.`,
      user: `Produce a daily intelligence summary (400-500 words) from these items. The items span from the last few hours to the past week — give weight to significance, not just recency. Structure as:

**TODAY'S HEADLINES** (the 2-3 most important developments right now, regardless of age)
**DEVELOPING STORIES** (items that represent evolving situations, ongoing shifts, or emerging patterns worth tracking over time)
**STRATEGIC CONTEXT** (connect the dots: what do these items collectively signal about the direction of the field? what should the reader be thinking about?)
**ACTION ITEMS** (specific things to investigate, prototype, escalate, or plan for — with suggested priority and urgency)

Avoid redundancy with a risk assessment or what/so-what/now-what analysis — focus on the narrative and strategic picture.
${citationRule}
Items:\n${itemSummaries}`,
    },
    gaps: {
      system: `You are an AI intelligence feed curator for: ${context}\nIdentify coverage gaps and suggest concrete sources to fill them. Be specific and actionable.`,
      user: `Review these feed items and identify coverage gaps. For EACH gap, suggest 1-3 specific sources to fill it.

Use this exact format for each gap:

### [Gap title]
[1-2 sentence description of what's missing and why it matters]

Suggested sources:
- [Source Name](#feed-URL) — brief reason this source fills the gap
- [Source Name](#feed-URL) — brief reason

After the gaps, add a section:

**PERSPECTIVE BIAS** — Is the feed skewed toward particular viewpoints? Note any missing contrarian, regional, or critical voices.

IMPORTANT:
- Every gap MUST include at least one suggested source with a real, working URL
- Use the exact format [Name](#feed-URL) for suggested sources — the URL should be an RSS feed, blog, Substack, X account, or YouTube channel
- Focus on specific, high-quality sources, not generic suggestions
- Consider gaps in: geographic coverage (Asia, Europe, Global South), technical domains (hardware, robotics, security), emerging players, regulatory jurisdictions, and contrarian viewpoints
${citationRule}
Items:\n${itemSummaries}`,
    },
    risks: {
      system: `You are an AI risk analyst for: ${context}\nYou produce risk landscape scans. Your job is to surface threats, not opportunities. Be specific about timeframes. No preamble.`,
      user: `Scan these items and produce a risk landscape. This is a BROAD SCAN — cover as many distinct risk signals as possible, not deep analysis of individual items.

For each risk category below, list 1-3 bullet points. Each bullet should be ONE concise sentence identifying a specific risk signal, with a likelihood/impact tag and a source citation. If a category has no risk signals, write "No signals detected."

**IMMEDIATE (next 30 days)** — What could catch us off-guard soon?
**REGULATORY & COMPLIANCE** — New rules, enforcement, deadlines, jurisdictional shifts
**TECHNOLOGY & ARCHITECTURE** — Deprecations, capability jumps that invalidate current plans, security issues
**VENDOR & COMPETITIVE** — Lock-in, pricing, platform shifts, competitive moves
**OPERATIONAL** — Workforce, process, reputational, organizational exposure

Format each bullet as: - [risk signal sentence] — **L**:high/med/low **I**:high/med/low [citation]

Keep this scan BROAD and BRIEF — one sentence per risk, no paragraphs. A companion "What/So What/Now What" analysis provides deeper strategic analysis of the most important items.
${citationRule}
Items:\n${itemSummaries}`,
    },
    "what-so-what-now-what": {
      system: `You are a strategic advisor for: ${context}\nYou produce deep-dive strategic analysis using the What/So What/Now What framework. Focus on decisions and actions, not just risks. No preamble.`,
      user: `Select 3-5 items that MOST DEMAND A STRATEGIC RESPONSE — these could be opportunities, threats, or inflection points. Choose items where doing nothing has a cost OR where acting early creates advantage.

IMPORTANT: This analysis COMPLEMENTS a separate risk scan. Do NOT produce a risk list. Instead, provide DEEP STRATEGIC ANALYSIS of a few high-impact items. At least 1-2 selections should be opportunities or strategic openings, not just threats.

For each selected item, write a structured analysis:

### [Item title or short description]
**WHAT** — What specifically changed? (Factual: one sentence)
**SO WHAT** — Why does this matter to us specifically? (2-3 sentences connecting this to our strategy, architecture, competitive position, or roadmap. Be concrete — name specific systems, teams, or initiatives affected.)
**NOW WHAT** — What should we do? (A specific action with an owner, a timeframe, and a definition of done. "Monitor" is only acceptable if you specify what to watch for and when to escalate.)

End with a **PRIORITIES** section that rank-orders the 3-5 items by urgency and names a single recommended "act first" item.
${citationRule}
Items:\n${itemSummaries}`,
    },
  };

  const prompt = prompts[mode];
  if (!prompt) throw new Error(`Unknown analysis mode: ${mode}`);

  try {
    const result = await callClaude(prompt.system, prompt.user, 2000);
    const itemIds = sourceItems.map((i) => i.id);
    cacheAnalysis(mode, category, result, itemIds);
    // Include source items so the frontend can render item popovers
    const feedNameMap = Object.fromEntries(getAllFeeds().map(f => [f.id, f.name]));
    const sourceItemMap = Object.fromEntries(sourceItems.map(it => [it.id, {
      id: it.id, title: it.title, summary: it.summary, url: it.url,
      category: it.category, relevance: it.relevance,
      relevance_reason: it.relevance_reason, feed_id: it.feed_id,
      feed_name: feedNameMap[it.feed_id] || it.feed_id,
      published: it.published, tags: it.tags, saved: it.saved,
    }]));
    return { result, cached: false, generatedAt: new Date().toISOString(), sourceItems: sourceItemMap };
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
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", category: "news" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "news" },
  { name: "Ars Technica AI", url: "https://feeds.arstechnica.com/arstechnica/technology-lab", category: "news" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "news" },
  { name: "The Rundown AI", url: "https://www.therundown.ai/feed", category: "news" },
];

export async function analyzeFeedHealth(feedHealth, onProgress = () => {}) {
  // Return cached result if still fresh
  if (_healthCache.result && (Date.now() - _healthCache.ts) < HEALTH_CACHE_TTL) {
    console.log("[Health] Returning cached analysis (< 30 min old)");
    onProgress({ step: "complete", pct: 100, message: "Using cached results" });
    return _healthCache.result;
  }

  onProgress({ step: "discovery", pct: 10, message: "Scanning feeds for new sources..." });

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
    discoverFeedsFromContent().then(r => { onProgress({ step: "link-mining", pct: 30, message: "Link mining complete" }); return r; }),
    discoverFeedsFromSearch().then(r => { onProgress({ step: "web-search", pct: 45, message: "Web search complete" }); return r; }),
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
  onProgress({ step: "analyzing", pct: 55, message: `Analyzing ${feedHealth.length} feeds with ${novelDiscoveries.length} candidates...` });

  const systemPrompt = `You are a feed curation advisor for: ${context}
Analyze feed health and suggest new RSS feeds. Respond in JSON format only.`;

  const categories = "research, engineering, news, industry, policy, labs";
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
    onProgress({ step: "llm", pct: 70, message: "Waiting for LLM analysis..." });
    const result = await callClaude(systemPrompt, userMessage, 3000);
    onProgress({ step: "parsing", pct: 90, message: "Processing results..." });
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    _healthCache = { result: parsed, ts: Date.now() };
    onProgress({ step: "complete", pct: 100, message: "Analysis complete" });
    return parsed;
  } catch (err) {
    console.error(`[Health] Feed health analysis failed: ${err.message}`);
    return { stale: [], noisy: [], suggestions: [] };
  }
}
