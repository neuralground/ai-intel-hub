import { getItems, upsertItem, cacheAnalysis, getCachedAnalysis } from "./db.js";

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
  const systemPrompt = `You are a relevance scoring engine for an AI intelligence feed.
The reader is: ${context}

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
  const itemSummaries = items
    .slice(0, 15)
    .map(
      (it, i) =>
        `${i + 1}. [${it.category}] ${it.title}\n   Source: ${it.feedId} | Relevance: ${(it.relevance * 100).toFixed(0)}%\n   ${(it.summary || "").slice(0, 200)}`
    )
    .join("\n\n");

  const prompts = {
    briefing: {
      system: `You are an AI intelligence analyst for: ${context}\nProduce concise, actionable briefings. No preamble.`,
      user: `Produce an executive briefing (300-400 words) from these recent items. Structure as:

**CRITICAL DEVELOPMENTS** (items requiring immediate attention or action)
**STRATEGIC SIGNALS** (emerging patterns, shifts, or trends to monitor)
**ACTION ITEMS** (specific things to investigate, prototype, escalate, or dismiss)

Items:\n${itemSummaries}`,
    },
    gaps: {
      system: `You are an AI intelligence feed curator for: ${context}\nIdentify coverage gaps and suggest improvements.`,
      user: `Review these feed items and identify:

**COVERAGE GAPS** - Important AI topics NOT represented (hardware/chips, specific jurisdictions, emerging players, technical domains)
**PERSPECTIVE BIAS** - Is the feed skewed toward particular viewpoints? Missing contrarian or critical voices?
**SUGGESTED ADDITIONS** - Recommend 5 specific new sources with URLs where possible (substacks, blogs, X accounts, newsletters)

Items:\n${itemSummaries}`,
    },
    risks: {
      system: `You are an AI risk analyst for: ${context}\nFocus on actionable risk intelligence.`,
      user: `Produce a focused risk assessment from these items:

**REGULATORY RISKS** - Upcoming deadlines, new guidance, enforcement actions, compliance implications
**TECHNOLOGY RISKS** - Capability shifts that could disrupt current architecture decisions or strategy
**VENDOR RISKS** - Competitive landscape changes affecting platform and model provider decisions
**OPERATIONAL RISKS** - Workforce, security, process, or organizational implications

Items:\n${itemSummaries}`,
    },
    "what-so-what-now-what": {
      system: `You are a strategic advisor for: ${context}\nUse the What/So What/Now What framework.`,
      user: `For each of the 3-5 most significant items, provide:

**WHAT** - What changed? (Factual: new capability, regulation, risk, or market shift)
**SO WHAT** - Why does it matter? (Implication for architecture, strategy, governance, competitive position)
**NOW WHAT** - What should be done? (Prototype, escalate, monitor, dismiss — and who should own it)

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
export async function analyzeFeedHealth(feedHealth) {
  const context = getRelevanceContext();
  const feedSummary = feedHealth
    .map(
      (f) =>
        `- ${f.name} [${f.category}/${f.type}]: ${f.live_items} items, avg relevance ${((f.computed_avg_relevance || 0) * 100).toFixed(0)}%, latest: ${f.latest_item || "never"}`
    )
    .join("\n");

  const systemPrompt = `You are a feed curation advisor for: ${context}
Analyze feed health and suggest improvements. Respond in JSON format only.`;

  const userMessage = `Analyze these feeds and respond with JSON:
{
  "stale": [{"id": "...", "reason": "..."}],
  "noisy": [{"id": "...", "reason": "..."}],
  "suggestions": [{"name": "...", "url": "...", "type": "rss|substack|x-account", "category": "...", "reason": "..."}]
}

Feeds:\n${feedSummary}`;

  try {
    const result = await callClaude(systemPrompt, userMessage, 1500);
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[Health] Feed health analysis failed: ${err.message}`);
    return { stale: [], noisy: [], suggestions: [] };
  }
}
