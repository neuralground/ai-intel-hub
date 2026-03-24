import { getItems, getUnscoredItems, upsertItem, cacheAnalysis, getCachedAnalysis, getAllFeeds, getRecentFeedbackExamples, getItemById, getClusterMates } from "./db.js";
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

function getAnalysisProvider() {
  return process.env.LLM_ANALYSIS_PROVIDER || getProvider();
}

function getAnalysisModel() {
  if (process.env.LLM_ANALYSIS_MODEL) return process.env.LLM_ANALYSIS_MODEL;
  // No explicit analysis model — if same provider as scoring, use the scoring model;
  // otherwise fall back to the analysis provider's default
  if (getAnalysisProvider() === getProvider()) return getModel();
  return DEFAULT_MODELS[getAnalysisProvider()] || getModel();
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

async function callAnthropic(systemPrompt, userMessage, maxTokens, modelOverride) {
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
      model: modelOverride || getModel(),
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

async function callOpenAI(systemPrompt, userMessage, maxTokens, modelOverride) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelOverride || getModel(),
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

async function callGemini(systemPrompt, userMessage, maxTokens, modelOverride) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = modelOverride || getModel();
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

async function callOllama(systemPrompt, userMessage, maxTokens, modelOverride) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelOverride || getModel(),
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

async function callAnalysisLLM(systemPrompt, userMessage, maxTokens = 2000) {
  const provider = getAnalysisProvider();
  const model = getAnalysisModel();
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown LLM provider: ${provider}`);
  console.log(`[LLM:analysis] Using ${provider} / ${model}`);
  return fn(systemPrompt, userMessage, maxTokens, model);
}

// Keep backward-compatible alias
const callClaude = callLLM;

// ── Streaming provider functions (for analysis) ─────────────────────────────

async function* parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }
}

async function* streamAnthropic(systemPrompt, userMessage, maxTokens, modelOverride, signal) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-your-key-here") throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelOverride || getModel(),
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal,
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Anthropic API error ${response.status}: ${err}`); }

  for await (const data of parseSSEStream(response)) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        yield parsed.delta.text;
      }
    } catch { /* skip non-JSON lines */ }
  }
}

async function* streamOpenAI(systemPrompt, userMessage, maxTokens, modelOverride, signal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelOverride || getModel(),
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
    signal,
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`OpenAI API error ${response.status}: ${err}`); }

  for await (const data of parseSSEStream(response)) {
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) yield content;
    } catch { /* skip */ }
  }
}

async function* streamGemini(systemPrompt, userMessage, maxTokens, modelOverride, signal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = modelOverride || getModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      signal,
    }
  );
  if (!response.ok) { const err = await response.text(); throw new Error(`Gemini API error ${response.status}: ${err}`); }

  for await (const data of parseSSEStream(response)) {
    try {
      const parsed = JSON.parse(data);
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield text;
    } catch { /* skip */ }
  }
}

async function* streamOllama(systemPrompt, userMessage, maxTokens, modelOverride, signal) {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelOverride || getModel(),
      stream: true,
      options: { num_predict: maxTokens },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
    signal,
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Ollama API error ${response.status}: ${err}`); }

  // Ollama uses newline-delimited JSON (not SSE)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.done) return;
        if (parsed.message?.content) yield parsed.message.content;
      } catch { /* skip */ }
    }
  }
}

const STREAM_PROVIDERS = { anthropic: streamAnthropic, openai: streamOpenAI, gemini: streamGemini, ollama: streamOllama };

async function* streamAnalysisLLM(systemPrompt, userMessage, maxTokens = 2000, signal) {
  const provider = getAnalysisProvider();
  const model = getAnalysisModel();
  const fn = STREAM_PROVIDERS[provider];
  if (!fn) throw new Error(`Streaming not supported for provider: ${provider}`);
  console.log(`[LLM:analysis:stream] Using ${provider} / ${model}`);
  yield* fn(systemPrompt, userMessage, maxTokens, model, signal);
}

// ── Score a batch of items for relevance ─────────────────────────────────────
export async function scoreItems(items) {
  if (items.length === 0) return [];

  const context = getRelevanceContext();
  const instructions = getScoringInstructions();
  const validOrgLabels = new Set(getOrgLabels());

  // Build feedback calibration section from user signals
  const feedbackExamples = getRecentFeedbackExamples(5);
  const feedbackSection = feedbackExamples.length >= 2
    ? `\nThe reader has provided feedback on past items. Use these as calibration examples to understand what they actually find valuable:
${feedbackExamples.map(ex =>
  `- "${ex.title}" [${ex.category}] — scored ${ex.relevance.toFixed(2)}${ex.reason ? `: "${ex.reason}"` : ""} → Reader ${ex.signal} this`
).join("\n")}
Adjust your scoring to better match these preferences.\n`
    : "";

  const systemPrompt = `You are a relevance scoring engine for an AI intelligence feed.
The reader is: ${context}
${instructions ? `\nAdditional scoring instructions: ${instructions}\n` : ""}${feedbackSection}
Score each item from 0.0 to 1.0 for relevance to this reader. Also provide a brief reason (one sentence) explaining why it matters to them specifically.

SOURCE AUTHORITY — IMPORTANT: For preprint repositories (arXiv, SSRN, bioRxiv), author credibility is a MAJOR scoring factor. Apply these rules strictly:
- Solo author from a genuinely obscure or unrecognizable organization: HARD CAP at 0.55 regardless of topic relevance. These papers are unvetted and frequently low-quality or AI-generated.
- Multiple authors but all from obscure/unrecognizable orgs: cap at 0.65.
- Authors from ANY well-known institution: score normally based on topic relevance. This includes the recognized org list below, BUT ALSO any established university (e.g. McGill, ETH Zurich, University of Tokyo), major corporation (e.g. Oracle, SAP, Siemens), or government research lab you recognize — even if not in the org list. Use your world knowledge of institutional reputation.
- Multi-institutional teams from reputable orgs: no penalty, may deserve a boost.
The key signal is whether the authors have a credible, verifiable institutional affiliation. Treat these as obscure/unknown: "Independent researcher", one-person labs, vague names like "AI Research Lab" or "Institute of Advanced Studies", or affiliations you cannot verify as real organizations. Official publications from established organizations (lab blogs, peer-reviewed venues, major tech companies) carry inherent authority and need no penalty.

For each item, identify organizational affiliations. Consider both the authors (if they are from known organizations) and the source (if it is an organization's official blog or publication). Return matching organization names in an "affiliations" array. Use ONLY these recognized org names:
${getOrgNamesForPrompt()}

Only include affiliations you are confident about. If no notable affiliations are identifiable, return an empty array.

Respond ONLY with a JSON array of objects: [{"id": "...", "relevance": 0.85, "reason": "...", "tags": ["tag1", "tag2"], "affiliations": ["OrgName"]}]
No other text. Valid JSON only.`;

  const itemList = items.map((i) => ({
    id: i.id,
    title: i.title,
    summary: (i.transcript || i.summary || "").slice(0, i.transcript ? 500 : 200),
    authors: i.author || "",
    source: i.feedId || i.feed_id,
    url: i.url || "",
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
        const feedOrg = getFeedOrg(item.feedId || item.feed_id, item.url);
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

// ── Analysis prompt preparation (shared by streaming and non-streaming) ─────

function prepareAnalysis(mode, category = null, { force = false } = {}) {
  // Check cache first
  if (!force) {
    const cached = getCachedAnalysis(mode, category, 30);
    if (cached) {
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
      return { cached: true, result: cached.result, generatedAt: cached.created_at, sourceItems: sourceItemMap };
    }
  }

  const modeItemConfig = {
    briefing: { minRelevance: 0.4, limit: 30, sliceCount: 20 },
    risks:    { minRelevance: 0.3, limit: 20, sliceCount: 15 },
    "what-so-what-now-what": { minRelevance: 0.5, limit: 15, sliceCount: 10 },
  };
  const cfg = modeItemConfig[mode] || modeItemConfig.risks;

  const items = getItems({ category: category || "all", minRelevance: cfg.minRelevance, limit: cfg.limit });

  if (items.length === 0) {
    return { empty: true, result: "No items available for analysis. Try refreshing your feeds first." };
  }

  const context = getRelevanceContext();

  let sourceItems;
  if (mode === "briefing") {
    const now = Date.now();
    const fresh = items.filter(it => (now - new Date(it.published).getTime()) < 48 * 3600000);
    const older = items.filter(it => (now - new Date(it.published).getTime()) >= 48 * 3600000 && it.relevance >= 0.6);
    sourceItems = [...fresh.slice(0, 12), ...older.slice(0, 8)].slice(0, cfg.sliceCount);
  } else {
    sourceItems = items.slice(0, cfg.sliceCount);
  }

  const itemSummaries = sourceItems
    .map((it, i) => {
      const ageHours = (Date.now() - new Date(it.published).getTime()) / 3600000;
      const ageLabel = ageHours < 24 ? `${Math.round(ageHours)}h ago` : `${Math.round(ageHours / 24)}d ago`;
      return `${i + 1}. ID: ${it.id} | [${it.category}] ${it.title}\n   URL: ${it.url || "none"}\n   Source: ${it.feed_id} | Relevance: ${(it.relevance * 100).toFixed(0)}% | Published: ${ageLabel}\n   Affiliations: ${(it.affiliations || []).join(", ") || "none"}\n   ${(it.summary || "").slice(0, 200)}`;
    })
    .join("\n\n");

  const citationRule = `\nCITATION FORMAT (mandatory): Cite sources using EXACTLY this markdown link syntax: [short title](#item-ITEM_ID)
Example: [OpenAI announces GPT-5](#item-a1b2c3d4e5f67890)
The ITEM_ID is the hex ID shown after "ID:" for each item above. Do NOT use external URLs in citation links. Every claim must have at least one citation.`;

  const prompts = {
    briefing: {
      system: `You are an AI intelligence analyst producing a daily summary for: ${context}\nProduce a comprehensive daily intelligence summary. Include both breaking developments AND significant items from the past few days that deserve attention. No preamble.`,
      user: `Produce a daily intelligence summary (400-500 words) from these items. The items span from the last few hours to the past week — give weight to significance, not just recency. Structure as:

**TODAY'S HEADLINES** (the 2-3 most important developments right now, regardless of age)
**DEVELOPING STORIES** (items that represent evolving situations, ongoing shifts, or emerging patterns worth tracking over time)
**STRATEGIC CONTEXT** (connect the dots: what do these items collectively signal about the direction of the field? what should the reader be thinking about?)
**ACTION ITEMS** (specific things to investigate, prototype, escalate, or plan for — with suggested priority and urgency)

IMPORTANT: Each item includes a Relevance score (0-100%). This score reflects pre-assessed importance to the reader. Strongly prefer high-relevance items (70%+) for headlines and key points. Items below 60% should only appear if they provide essential context — never feature them as headlines. Do not treat all provided items as equally important.

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

  const feedNameMap = Object.fromEntries(getAllFeeds().map(f => [f.id, f.name]));
  const sourceItemMap = Object.fromEntries(sourceItems.map(it => [it.id, {
    id: it.id, title: it.title, summary: it.summary, url: it.url,
    category: it.category, relevance: it.relevance,
    relevance_reason: it.relevance_reason, feed_id: it.feed_id,
    feed_name: feedNameMap[it.feed_id] || it.feed_id,
    published: it.published, tags: it.tags, saved: it.saved,
  }]));

  return { cached: false, prompt, sourceItems: sourceItemMap, sourceItemsList: sourceItems };
}

function normalizeCitations(rawResult, sourceItems) {
  const validIds = new Set(sourceItems.map(i => i.id));
  // Build feed_id → item ID lookup for citations that use feed IDs instead of item IDs
  const feedIdToItemId = new Map();
  for (const item of sourceItems) {
    const fid = item.feed_id || item.feedId;
    if (fid && !feedIdToItemId.has(fid)) feedIdToItemId.set(fid, item.id);
  }

  return rawResult
    // Fix "[title] (URL)" — space between ] and ( → proper markdown link
    .replace(/\[([^\]]+)\]\s+\(((?:https?:\/\/|#)[^)]+)\)/g, "[$1]($2)")
    // Fix "[title](#ID)" missing item- prefix → add it
    .replace(/\[([^\]]+)\]\(#([a-f0-9]{8,})\)/g, (_, text, id) =>
      validIds.has(id) ? `[${text}](#item-${id})` : `[${text}]`)
    // Fix "[title](feed-id)" — LLM used feed ID as href instead of item ID
    .replace(/\[([^\]]+)\]\(([a-z0-9][a-z0-9_-]*)\)/g, (match, text, ref) => {
      // Check if ref is a known feed ID
      const itemId = feedIdToItemId.get(ref);
      if (itemId) return `[${text}](#item-${itemId})`;
      // Check if ref is a valid item ID (without #item- prefix)
      if (validIds.has(ref)) return `[${text}](#item-${ref})`;
      return `[${text}]`;
    })
    // Fix bare "text (#ID)" or "text (#item-ID)" without [] → wrap as link
    .replace(/(?<!\])(?<!\))\s*\(#(?:item-)?([a-f0-9]{8,})\)/g, (match, id) => {
      if (!validIds.has(id)) return match;
      return ` [↗](#item-${id})`;
    })
    // Fix bare "text (#feed-URL)" without [] → wrap as link
    .replace(/(?<!\])(?<!\))\s*\(#feed-(https?:\/\/[^)]+)\)/g, " [↗](#feed-$1)")
    // Fix bare "text (feed-id)" without [] or # → wrap as link
    .replace(/(?<!\])(?<!\))\s*\(([a-z0-9][a-z0-9_-]*)\)/g, (match, ref) => {
      const itemId = feedIdToItemId.get(ref);
      if (itemId) return ` [↗](#item-${itemId})`;
      if (validIds.has(ref)) return ` [↗](#item-${ref})`;
      return match;
    });
}

// ── Generate analysis briefing ──────────────────────────────────────────────
export async function generateAnalysis(mode, category = null, { force = false } = {}) {
  const prep = prepareAnalysis(mode, category, { force });
  if (prep.cached || prep.empty) return prep;

  try {
    const rawResult = await callAnalysisLLM(prep.prompt.system, prep.prompt.user, 2000);
    const result = normalizeCitations(rawResult, prep.sourceItemsList);
    const itemIds = prep.sourceItemsList.map(i => i.id);
    cacheAnalysis(mode, category, result, itemIds);
    return { result, cached: false, generatedAt: new Date().toISOString(), sourceItems: prep.sourceItems };
  } catch (err) {
    throw new Error(`Analysis failed: ${err.message}`);
  }
}

// ── Streaming analysis (yields chunks via onChunk callback) ─────────────────
export async function generateAnalysisStream(mode, category = null, { force = false } = {}, onChunk, signal) {
  const prep = prepareAnalysis(mode, category, { force });
  if (prep.cached || prep.empty) return prep;

  let accumulated = "";
  for await (const chunk of streamAnalysisLLM(prep.prompt.system, prep.prompt.user, 2000, signal)) {
    accumulated += chunk;
    onChunk(chunk);
  }

  const result = normalizeCitations(accumulated, prep.sourceItemsList);
  const itemIds = prep.sourceItemsList.map(i => i.id);
  cacheAnalysis(mode, category, result, itemIds);
  return { result, cached: false, generatedAt: new Date().toISOString(), sourceItems: prep.sourceItems };
}

// ── Content fetching for deep summarization ─────────────────────────────────

async function fetchArticleContent(url, maxChars = 12000) {
  if (!url) return null;
  try {
    const { load } = await import("cheerio");

    // For arXiv, try the HTML version (full paper text)
    // Match arXiv URLs in various formats: abs, pdf, html, DOI
    const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d+\.\d+)/)
      || url.match(/arXiv\.(\d+\.\d+)/);
    if (arxivMatch) {
      const paperId = arxivMatch[1];
      const htmlUrl = `https://arxiv.org/html/${paperId}`;
      try {
        const res = await fetch(htmlUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Intel-Hub/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = load(html);
          // Remove scripts, styles, nav, references section
          $("script, style, nav, header, footer, .ltx_bibliography, .ltx_appendix").remove();
          const text = $(".ltx_page_content").text() || $("article").text() || $("main").text() || $("body").text();
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned.length > 500) {
            console.log(`[Summarize] Fetched arXiv HTML for ${paperId}: ${cleaned.length} chars`);
            return cleaned.slice(0, maxChars);
          }
        }
      } catch { /* fall through to abstract page */ }

      // Fallback: try arXiv PDF
      try {
        const { parseOfficeAsync } = await import("officeparser");
        const pdfRes = await fetch(`https://arxiv.org/pdf/${paperId}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Intel-Hub/1.0)" },
          signal: AbortSignal.timeout(20000),
        });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const text = await parseOfficeAsync(buffer);
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned.length > 500) {
            console.log(`[Summarize] Parsed arXiv PDF for ${paperId}: ${cleaned.length} chars`);
            return cleaned.slice(0, maxChars);
          }
        }
      } catch (err) {
        console.log(`[Summarize] arXiv PDF parse failed for ${paperId}: ${err.message}`);
      }

      // Last resort: fetch arXiv abstract page
      try {
        const absRes = await fetch(`https://arxiv.org/abs/${paperId}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Intel-Hub/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        if (absRes.ok) {
          const html = await absRes.text();
          const $ = load(html);
          const abstract = $(".abstract").text().replace(/^Abstract:\s*/i, "").trim();
          const title = $(".title").text().replace(/^Title:\s*/i, "").trim();
          const authors = $(".authors").text().replace(/^Authors:\s*/i, "").trim();
          const content = `${title}\n\nAuthors: ${authors}\n\nAbstract: ${abstract}`;
          console.log(`[Summarize] Fetched arXiv abstract for ${paperId}: ${content.length} chars`);
          return content.slice(0, maxChars);
        }
      } catch { /* fall through to generic fetch */ }
    }

    // Generic web page fetch
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Intel-Hub/1.0)" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";

    // Handle binary document formats: PDF, DOCX, PPTX, XLSX, ODT
    const docTypes = ["pdf", "msword", "officedocument", "opendocument", "presentation", "spreadsheet"];
    if (docTypes.some(t => contentType.includes(t)) || url.match(/\.(pdf|docx?|pptx?|xlsx?|odt)(\?|$)/i)) {
      try {
        const { parseOfficeAsync } = await import("officeparser");
        const buffer = Buffer.from(await res.arrayBuffer());
        const text = await parseOfficeAsync(buffer);
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (cleaned.length > 100) {
          console.log(`[Summarize] Parsed document from ${new URL(url).hostname}: ${cleaned.length} chars`);
          return cleaned.slice(0, maxChars);
        }
      } catch (err) {
        console.log(`[Summarize] Document parse failed for ${url}: ${err.message}`);
      }
      return null;
    }

    const html = await res.text();
    const $ = load(html);
    $("script, style, nav, header, footer, aside, form, iframe, .sidebar, .comments, .advertisement").remove();
    const text = $("article").text() || $("main").text() || $(".post-content").text() || $(".entry-content").text() || $("body").text();
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length > 100) {
      console.log(`[Summarize] Fetched article content from ${new URL(url).hostname}: ${cleaned.length} chars`);
      return cleaned.slice(0, maxChars);
    }
    return null;
  } catch (err) {
    console.log(`[Summarize] Failed to fetch content from ${url}: ${err.message}`);
    return null;
  }
}

// ── Single-item deep summary (streaming) ────────────────────────────────────

function detectItemType(item) {
  const url = (item.url || "").toLowerCase();
  const feedId = (item.feed_id || "").toLowerCase();
  const category = (item.category || "").toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());

  // Academic papers
  if (url.includes("arxiv.org") || url.includes("doi.org") || url.includes("ssrn.com")
    || url.includes("biorxiv.org") || url.includes("openreview.net")
    || url.includes("aclanthology.org") || url.includes("proceedings.")
    || tags.includes("paper") || tags.includes("preprint")
    || category === "research") {
    return "academic";
  }
  // Product announcements and lab blogs
  if (category === "labs" || category === "engineering"
    || tags.some(t => ["release", "launch", "announcement", "product"].includes(t))) {
    return "product";
  }
  // News and industry
  return "general";
}

export async function generateItemSummaryStream(itemId, onChunk, signal) {
  const item = getItemById(itemId);
  if (!item) throw new Error("Item not found");

  const context = getRelevanceContext();
  const clusterMates = getClusterMates(item.cluster_id, item.id, 5);
  const itemType = detectItemType(item);

  // Fetch full article content from the source URL
  const fetchedContent = await fetchArticleContent(item.url);
  const content = fetchedContent || item.transcript || item.summary || "";
  const contentSource = fetchedContent ? "full document" : item.transcript ? "transcript" : "summary only";

  let relatedSection = "";
  if (clusterMates.length > 0) {
    relatedSection = `\n\nRELATED ITEMS (similar or duplicate coverage from other sources — reference these in the Related Work section):\n` +
      clusterMates.map((r, i) => `${i + 1}. "${r.title}" (${r.feed_id}) — ${(r.summary || "").slice(0, 150)}`).join("\n");
  }

  const itemMeta = `Title: ${item.title}
Authors: ${item.author || "Unknown"}
Source: ${item.feed_id}
URL: ${item.url || "none"}
Published: ${item.published}
Relevance score: ${(item.relevance * 100).toFixed(0)}%
${item.relevance_reason ? `Relevance reason: ${item.relevance_reason}` : ""}
Tags: ${(item.tags || []).join(", ") || "none"}
Affiliations: ${(item.affiliations || []).join(", ") || "none"}

Content (source: ${contentSource}):
${content.slice(0, 10000)}
${relatedSection}`;

  const headerInstruction = `IMPORTANT: Begin your response with EXACTLY this header (do not alter the format):

# ${item.title}

**Authors:** ${item.author || "Unknown"}
**Source:** [${item.url || "N/A"}](${item.url || "#"})

Then proceed with the analysis sections below.`;

  let systemPrompt, userMessage;

  if (itemType === "academic") {
    systemPrompt = `You are a senior research analyst with deep expertise in AI/ML, producing a rigorous academic paper review for: ${context}
Write in markdown. Be thorough, nuanced, and scholarly in your analysis.`;

    userMessage = `Produce a detailed academic review of this paper:

${itemMeta}

${headerInstruction}

## Summary
A thorough, accurate summary of the paper. Capture the key contributions, proposed methods, experimental setup, and principal findings. Distinguish between what the authors claim and what they demonstrate with evidence.

## Relevance & Strategic Implications
Why this paper matters to the reader specifically, given their role and focus areas. Identify concrete implications for their strategy, architecture decisions, or roadmap. What opportunities or risks does this research create?

## Related Work & Context
Position this paper within the broader research landscape. Reference the related items listed above (if any). Discuss how this work relates to, extends, or contradicts prior work mentioned in the paper. Note key citations and competing approaches.

## Critical Analysis
Provide a rigorous scholarly critique:
- **Novelty**: How original is the contribution? Is this incremental or a genuine advance?
- **Methodology**: Evaluate experimental design, baselines, datasets, and evaluation metrics. Are they appropriate and sufficient?
- **Reproducibility**: Is there enough detail to reproduce the results? Is code or data available?
- **Statistical rigor**: Are claims supported by the evidence? Look for cherry-picked results, missing error bars, unfair comparisons, or overgeneralized conclusions.
- **Limitations**: What do the authors acknowledge? What do they miss? Under what conditions might these results not hold?
- **Author credibility**: Consider affiliations, track record, and potential conflicts of interest. Is this peer-reviewed or a preprint?

## Open Questions
What are the most important unanswered questions or promising follow-up directions?

Include a link to the original paper: [View paper](${item.url || "#"})`;

  } else if (itemType === "product") {
    systemPrompt = `You are a technology strategist and product analyst producing a summary for: ${context}
Write in markdown. Focus on practical implications and strategic relevance.`;

    userMessage = `Produce a summary and analysis of this product/engineering announcement:

${itemMeta}

${headerInstruction}

## Summary
Clear summary of what was announced, released, or changed. Capture the key features, capabilities, and stated goals.

## Relevance & Strategic Implications
Why this matters to the reader. How does it affect their technology stack, vendor relationships, competitive landscape, or strategic plans? Be specific about impact.

## Related Work & Context
Connections to the related items listed above (if any). How does this compare to competing products or alternative approaches? What market or technology trends does this reflect?

## Considerations
Practical factors to evaluate:
- **Maturity**: Is this GA, beta, preview, or vaporware? What's the adoption risk?
- **Vendor dynamics**: Does this create lock-in, shift pricing, or change the competitive balance?
- **Gaps**: What's missing from the announcement? What questions should the reader ask before acting?

Include a link to the original: [View source](${item.url || "#"})`;

  } else {
    systemPrompt = `You are a senior intelligence analyst producing a summary for: ${context}
Write in markdown. Focus on accuracy and strategic relevance.`;

    userMessage = `Produce a summary and analysis of this item:

${itemMeta}

${headerInstruction}

## Summary
Accurate, concise summary of the key points. Capture the who, what, why, and implications.

## Relevance & Observations
Why this matters to the reader specifically. Highlight strategic implications, opportunities, or risks. Be concrete about how this connects to their work.

## Related Work & Context
Connections to the related items listed above (if any). How does this fit into broader trends or ongoing developments in the field?

## Considerations
Note any important caveats:
- **Source perspective**: Is this reporting objective, or does the source have a particular angle or interest?
- **Completeness**: What context is missing? What other perspectives should the reader seek out?
- **Actionability**: Are there concrete next steps the reader should consider?

Include a link to the original: [View source](${item.url || "#"})`;
  }

  const provider = getAnalysisProvider();
  const model = getAnalysisModel();

  let accumulated = "";
  for await (const chunk of streamAnalysisLLM(systemPrompt, userMessage, 3000, signal)) {
    accumulated += chunk;
    onChunk(chunk);
  }

  return {
    result: accumulated,
    contentSource,
    generatedAt: new Date().toISOString(),
    provider,
    model,
  };
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
