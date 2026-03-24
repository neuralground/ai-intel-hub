# AI Intelligence Hub -- User Guide

This guide walks through every feature of the AI Intelligence Hub desktop application.

---

## Installation

### macOS

1. Download the `.dmg` file for your architecture (arm64 for Apple Silicon, x64 for Intel Macs).
2. Open the DMG and drag **AI Intelligence Hub** into your Applications folder.
3. On first launch, macOS may warn that the app is from an unidentified developer. Right-click the app icon, choose **Open**, then click **Open** in the dialog to bypass Gatekeeper.
4. The app opens and begins loading sources immediately.

### Windows

1. Download the `.exe` installer.
2. Run the installer and follow the prompts. Choose a per-user or system-wide installation.
3. Launch **AI Intelligence Hub** from the Start Menu or Desktop shortcut.

---

## Getting Started

When you first open AI Intelligence Hub, the app begins working immediately:

1. Approximately 50 pre-configured sources start loading across six categories: AI Research, Engineering and Practice, Industry and Capital, Policy and Governance, AI Labs, and AI News and Announcements.
2. Items appear in the main list within 10-30 seconds as each source is fetched.
3. If no LLM provider is configured, items display with a default relevance of 50%. Scoring, briefings, and source health analysis require an LLM provider to be set up.

### Quick Setup (5 minutes)

1. **Open Settings** -- click the gear icon in the header bar (or press Cmd+, on macOS / Ctrl+, on Windows).
2. **Describe your role** -- in the "Your Role" text area, write a specific description of who you are and what you care about. This is the single most impactful setting. Example: *"Senior technology executive at a major bank focused on agentic AI architecture, EU AI Act compliance, and sovereign AI risk."*
3. **Choose an LLM provider** -- in the AI Engine section, select a provider:
   - **Ollama** (recommended for getting started) -- free, runs locally. Install from [ollama.com](https://ollama.com), pull a model (`ollama pull gemma2`), and select it in settings. No API key needed.
   - **Anthropic**, **OpenAI**, or **Google Gemini** -- paste your API key. These provide higher-quality scoring but incur per-use costs.
4. **Test the model** -- click the **Test** button next to the model selector to verify connectivity.
5. **Save** -- click Save at the bottom. The app immediately begins scoring items with your configured model.

You can optionally set a separate, more capable model for analysis (Intel Brief, Coverage Gaps) under "Analysis Model" while keeping a fast model for scoring. See [Settings](#settings) for full details.

---

## Understanding the Dashboard

The dashboard is divided into three main areas: the header bar, the sidebar, and the item list.

### Header Bar

The header bar runs across the top of the window and contains:

- **App name** on the left.
- **Stats counters** showing the total number of sources, unread items, and critical items. The critical count is clickable (see [Critical Items](#critical-items)).
- **Search field** for filtering items by keyword. Searches match against titles, summaries, authors, and tags. A clear button (✕) appears when text is entered.
- **Toolbar buttons** on the right: Refresh, Analysis (briefing panel), Sources (source management), Saved items, and Settings (gear icon).

### Sidebar

The sidebar sits on the left side and provides:

- **Category filters** -- buttons for each of the six feed categories (including AI News and Announcements). Click one to filter the item list to that category. Click it again (or click "All") to clear the filter.
- **Relevance slider** -- drag to set the minimum relevance threshold. Items scoring below this threshold are hidden. This is useful for cutting through noise when you only want high-signal content.
- **Recency slider** -- filter items by age. Stops at: All time (default), Last 24h, Last 3d, Last 7d, Last 14d, and Last 30d. Drag to restrict the item list to content published within the selected window.
- **Organizations filter** -- a scrollable list of organizations ranked by a composite score (freshness 40%, average relevance 30%, log-scaled count 30%), with item counts. Select one or more organizations to filter the item list to items affiliated with those orgs. Multi-select is supported: click additional orgs to add them to the filter. A clear button at the top resets the organization filter.
- **Sources filter** -- a scrollable multi-select list of active sources with item counts, ranked by the same composite score as organizations. Select one or more sources to show only items from those sources. This is useful for focusing on specific publications or newsletters.
- **Theme toggle** -- switch between System, Light, and Dark appearance modes.

All sidebar filters (relevance, recency, organizations, and sources) are applied instantly on the client side with no network delay. The server is only contacted for coarse filters like category, search, and critical item toggling.

### Item List

The main area of the dashboard displays items as a vertical list of cards. Each card shows:

- **Title** -- the headline of the article, paper, or post.
- **Category badge** -- color-coded label indicating the feed category (e.g., "AI Research" in blue, "Policy & Governance" in red).
- **Relevance percentage** -- a numeric score (0-100%) indicating how relevant the item is to your configured role and priorities. Color shifts from gray (low) through yellow (medium) to green (high).
- **Source name** -- which source the item came from.
- **Time** -- relative timestamp (e.g., "2h ago", "yesterday").
- **Organization badges** -- small text-only badges showing affiliated organizations detected in the content (see [Organization Affiliations](#organization-affiliations)).
- **Summary snippet** -- a brief preview of the item content.

Unread items appear with slightly bolder styling. Read items are visually dimmed.

### Deduplicated Items

When multiple sources cover the same story, the app groups them using semantic similarity. The highest-relevance version is displayed with a **"N sources"** badge. Click to expand and see the "ALSO COVERED BY" section listing the other sources with links. This reduces clutter while preserving access to all perspectives. Deduplication sensitivity can be adjusted in Settings under the AI Engine section.

### Pagination

Items are displayed 25 per page. Page navigation controls appear at the bottom of the item list. Use the Previous and Next buttons or click a specific page number to navigate.

---

## Interacting with Items

### Expanding an Item

Click any item card to expand it. The expanded view shows:

- The full summary text.
- **"Why this matters"** -- a one-sentence explanation generated by the LLM during scoring, describing why this item is relevant to your specific role and focus areas. This appears only for items that have been scored.
- **Tags** -- topic tags extracted from the content (e.g., "agents", "MCP", "reasoning", "EU AI Act"). Tags are generated by a combination of regex pattern matching at ingest time and LLM enrichment during scoring.

### Actions

Each expanded item provides these action buttons:

- **Open** -- opens the original article, paper, or post in your default browser.
- **Summarize** -- generates a deep LLM summary of the item in a streaming modal. See [Summarize](#summarize) below.
- **Thumbs up / Thumbs down** -- provide relevance feedback. Thumbs up signals "more like this" and thumbs down signals "less like this." This feedback is used to improve future scoring. See [Tips and Best Practices](#tips-and-best-practices) for more on feedback.
- **Save** (star icon) -- bookmarks the item to your Saved collection. Saved items are preserved during daily cleanup and can be accessed from the Saved panel.
- **Mark read** -- marks the item as read, dimming it in the list.
- **Dismiss** -- soft-deletes the item from your view. Dismissed items no longer appear in the list but are not permanently deleted.

### Summarize

Clicking the **Summarize** button on an expanded item opens a modal that generates a deep LLM-powered summary of the item's content. The backend fetches the full article content from the source URL -- supporting HTML pages, PDFs, DOCX files, and other formats. For arXiv papers, the fetcher tries PDF download first, then the HTML rendering, then the arXiv API, and finally falls back to abstract scraping, ensuring the fullest possible content is retrieved.

The summary streams into the modal in real time, so you can begin reading before generation is complete. The summary header includes the item's title, authors, publication date, source link, and author affiliations (extracted from the paper when available).

**Type-aware analysis.** The depth and style of the summary adapts to the content type. Academic papers receive rigorous multi-paragraph analysis with hyperlinks to related work. Product announcements and general news receive lighter, more concise treatment. A critical analysis paragraph is included only when material concerns exist -- otherwise it is omitted to avoid filler.

Once finished, the modal displays metadata about how the content was sourced and which model produced the summary.

The Summarize modal includes two export options:

- **Save as Markdown** -- downloads the summary as a `.md` file for archiving or sharing.
- **Save as PDF** -- in the desktop app, opens a native file save dialog so you can choose where to save the PDF (it does not open a print dialog). In the web/browser version, falls back to the system print dialog.

### Exporting Analysis

The Analysis panel also includes **Save as Markdown** and **Save as PDF** export buttons. Save as PDF behaves the same as in the Summarize modal: in the desktop app it opens a native file save dialog, while in the browser it falls back to the system print dialog. These export options let you archive briefings, risk scans, and other analysis outputs for offline use or distribution.

---

## Refresh and Progress

### How Refresh Works

Clicking the Refresh button in the header bar triggers a multi-stage process:

1. **Fetch sources** -- all active RSS sources are fetched concurrently (up to 5 at a time).
2. **Score items** -- newly fetched items that have not been scored are sent to the configured LLM in batches of 15 for relevance scoring.
3. **Update** -- the item list refreshes with new items and updated scores.

### Progress Bar and Stages

During a refresh, a progress bar appears below the header showing the current stage (fetching, scoring) and progress within that stage. Each stage label updates as the work progresses.

### Cancel Button

You can cancel a refresh in progress by clicking the Cancel button that appears alongside the progress bar. Sources already fetched and items already scored are retained; only the remaining work is canceled.

### Auto-Refresh

Sources are automatically refreshed on a configurable interval (default: every 30 minutes). New items are scored automatically after each refresh. The interval can be changed in Settings under "Source Refresh Interval."

---

## Critical Items

### What Makes an Item Critical

An item is flagged as critical when it meets all of the following criteria:

- **High relevance** -- relevance score of 0.85 or higher.
- **Fresh** -- published within the last 48 hours.
- **Authoritative source** -- the item comes from an organization feed (e.g., an official AI lab blog), a feed marked as authoritative by the user, or the item has detected organization affiliations.

The critical count is displayed in the header bar stats.

### Filtering by Critical Items

Click the critical item count in the header bar to filter the item list to show only critical items. This is useful for a quick daily scan of the most important developments.

### Clearing the Filter

Click the critical count again, or click "All" in the category sidebar, to return to the full item list.

---

## Organization Affiliations

### How Affiliations Are Detected

The app uses a three-layer approach to detect which organizations are associated with a piece of content:

1. **Feed-level tagging** -- feeds from known organization sources (e.g., the OpenAI blog, Google DeepMind blog, Microsoft Research) are automatically tagged with their org affiliation.
2. **LLM-based detection** -- during scoring, the LLM is given the list of recognized organizations and asked to identify any that are mentioned or affiliated with the content (particularly useful for research papers with multiple institutional authors).
3. **Regex fallback** -- explicit affiliations in author strings (e.g., "Researcher at Stanford") are caught by pattern matching.

### Org Badges

When affiliations are detected, small text-only badges appear on the item card showing the short organization name. The AI identifies both author affiliations to the organization and references in items to the organization, its products, or technologies.

### Recognized Organizations

Items can also be filtered by organization using the Organizations filter in the sidebar (see [Sidebar](#sidebar)).

The app recognizes 34 organizations across three categories:

**AI Labs and Big Tech:** Google/DeepMind, OpenAI, Anthropic, Meta/FAIR, Microsoft, Apple, Amazon/AWS, NVIDIA, xAI, Mistral, Cohere, Hugging Face, Baidu, Tencent, Alibaba, ByteDance, Samsung, Intel, IBM, Salesforce.

**Research Labs:** AI2 (Allen Institute for AI).

**Universities:** Stanford, MIT, CMU, Berkeley, Harvard, Princeton, Oxford, Cambridge, ETH Zurich, Tsinghua, Peking University, University of Toronto, Mila/Montreal.

The list of recognized organizations can be viewed and customized in Settings.

---

## Analysis and Summaries

### The Analysis Panel

Click the Analysis button in the header bar to open the briefing panel. Three analysis modes are available:

- **Daily Summary** -- a wider-view structured summary mixing both fresh and older high-relevance items, organized into Critical Developments, Strategic Signals, and Action Items.
- **Risk Scan** -- a broad bullet scan identifying Regulatory, Technology, Vendor, and Operational risks from recent content, each with likelihood and impact assessments.
- **What / So What / Now What (WSNW)** -- deep strategic dives on 3-5 actionable items: what changed, why it matters, and what to do about it.

A separate **Coverage Gaps** analysis is available in the Sources panel (see [Coverage Gap Detection](#coverage-gap-detection)).

Each mode can be run for all categories or filtered to a specific category.

### Generation Progress and Timestamps

While an analysis is being generated, an animated progress bar is displayed. Once complete, the analysis shows which model generated it ("Powered by ...") and a timestamp (e.g., "Generated 5m ago (cached)"). A **Regenerate** button next to the timestamp lets you force a fresh analysis even if a cached version exists.

### Source References

Analysis text includes inline references to the source items it drew from. Hovering over a reference displays a popover showing the source item's title, category, relevance score, feed name, and summary. Clicking a reference opens the original article. This lets you quickly verify claims and drill into the underlying content.

### Caching

Analysis results are cached for 30 minutes. Running the same analysis mode and category combination within that window returns the cached result instantly. After the cache expires, or if you switch categories, a fresh analysis is generated. Use the Regenerate button to bypass the cache on demand.

---

## Managing Sources

### The Sources Panel

Click the Sources button in the header bar to open source management. The panel lists all configured sources with their status.

### Source Health Indicators

Each source shows a colored dot indicating its health:

- **Green** -- source is active and fetching successfully.
- **Yellow** -- source has not returned new items recently or has intermittent errors.
- **Red** -- source is failing to fetch (network errors, invalid URL, source removed).

The status text next to the dot provides specifics (e.g., "12 items, updated 2h ago" or "Error: 404 Not Found").

### Adding New Sources

Click "Add Source" at the top of the Sources panel. Provide:

- **Name** -- a display label for the source.
- **URL** -- the RSS/Atom feed URL.
- **Category** -- which category to file items under (Research, Engineering, Industry, Policy, or Labs).
- **Type** -- typically "rss" for standard sources.

The source begins fetching immediately after being added.

### Muting and Deleting Sources

- **Mute** -- toggles a source's active status. Muted sources are not fetched during refresh cycles but their existing items remain in the database.
- **Delete** -- permanently removes the source and all its items from the database.

### Authoritative Source Checkbox

Each source has an "Authoritative" checkbox. When checked, the source is treated as authoritative, which means:

- Items from this source receive a boost when calculating critical item status.
- The source is weighted more heavily in analysis and briefing generation.

Mark sources as authoritative when they represent primary publications you trust for accuracy and significance -- official lab blogs, major research institutions, key regulatory bodies.

### Source Health Analysis and Suggestions

At the bottom of the Sources panel, you can run a source health analysis. This uses the LLM to evaluate all your sources and identify:

- **Stale sources** -- sources that have not produced new content recently.
- **Noisy sources** -- sources with high volume but consistently low relevance scores.
- **Suggested new sources** -- recommendations for sources that would fill gaps in your coverage.

Suggestions can be accepted (which adds the source automatically) or dismissed.

### Coverage Gap Detection

The coverage gap analysis is available in the Sources panel via the **Coverage Gaps** button. It examines your current source set and identifies topic areas, geographies, or perspectives that are underrepresented.

For each gap, the analysis suggests specific sources to fill it. Each suggestion includes an **Add** button to subscribe to that source directly from the report. Added sources begin fetching immediately. A **Regenerate** button lets you refresh the analysis after adding sources or changing your configuration.

---

## Settings

Open Settings by clicking the gear icon in the header bar or pressing Cmd+, (macOS) / Ctrl+, (Windows). Settings are organized into four collapsible sections. Each section remembers whether you left it expanded or collapsed.

### Section 1: Profile (always visible)

**Your Role (Relevance Context)** -- the most impactful setting. Describe who you are, what you do, and what topics matter to you. This context is injected into every LLM prompt -- for relevance scoring, briefings, risk analysis, and source suggestions. Be specific: "Senior technology executive at a major bank focused on agentic AI, EU AI Act compliance, and sovereign AI risk" produces much better results than "I work in tech."

**Scoring Instructions** -- additional guidance for the LLM when scoring items. Use this for temporary priorities, topics to boost or suppress, or specific angles. Example: "Prioritize anything related to the EU AI Act August 2026 deadline. Deprioritize cryptocurrency unless directly related to AI."

**Theme** -- choose between System (follows OS preference), Light, and Dark appearance modes.

### Section 2: AI Engine

**Scoring Model** -- the LLM used for item scoring, affiliation detection, and feed health analysis. Four providers are supported:

- **Anthropic** -- Claude Sonnet, Haiku, Opus. Requires API key (`sk-ant-...`).
- **OpenAI** -- GPT-4o, GPT-4o Mini, GPT-4 Turbo, o3-mini. Requires API key (`sk-...`).
- **Google Gemini** -- Gemini 2.0 Flash, 2.5 Pro/Flash. Requires API key (`AIza...`).
- **Ollama** -- runs models locally, no API key needed. Install from [ollama.com](https://ollama.com). Available models are detected automatically.

Click a provider, select a model, and use the **Test** button to verify connectivity. The test runs a quick inference and shows response time.

**Analysis Model** -- optionally use a different (typically more capable) model for Intel Brief and Coverage Gap analysis. Select "Same" to use the scoring model, or pick a separate provider and model. This lets you use a fast/cheap model for high-volume scoring and a more capable model for analysis.

**Deduplication** -- controls semantic clustering of duplicate items. When enabled, items covering the same story from different sources are grouped together, showing the best version with links to others. Settings:
- **On/Off toggle** -- enable or disable deduplication.
- **Sensitivity slider** -- controls how similar items must be to cluster together. "Broad" groups loosely related items; "Strict" only groups near-identical coverage. Default is in the middle.
- **Time window** -- how far back to look for duplicates (3, 7, 14, or 30 days).
- **Model status** -- shows whether the local embedding model is loaded and ready.

**Source Refresh Interval** -- how often sources are automatically refreshed, in minutes. Default is 30. Lower values mean fresher content but more LLM calls for scoring.

### Section 3: Organizations

View and manage recognized organizations for affiliation tagging. Organizations are grouped by type (Companies, AI Labs, Universities, Other) with collapsible sub-groups.

Each organization card shows its favicon (pulled from its website URL), name, aliases, and On/Off toggle. Deactivating an organization hides it from the sidebar filter and item badges without deleting it. Reactivating restores it immediately.

**Adding organizations:** Click "+ Add" and provide a name, type, website URL (for the favicon), and optional aliases (comma-separated alternative names the LLM should recognize). After adding, the app offers to rescan existing items.

**Domain matching:** When an item's URL matches an organization's website domain, the organization is automatically affiliated -- no hardcoded mapping needed.

### Section 4: Connections

**Connected Services** -- connect third-party platforms for authenticated content access:
- X/Twitter, Substack, LinkedIn, Threads, YouTube.
- In the desktop app, clicking "Sign in" opens a browser login window. No API keys needed.
- Health checks run automatically when Settings opens. Expired sessions show a **Reconnect** button that opens a fresh login window.
- Custom services can be added for platforms not in the default list.

**Advanced** -- maintenance operations (collapsed by default):
- **Clear old items** -- remove items older than a specified number of days. Saved items are preserved.
- **Re-score all items** -- resets all scores and re-runs LLM scoring. Shows a progress bar with batch count, estimated time remaining, and a **Cancel** button to stop safely (already-scored items keep their new scores). For local models (Ollama), the warning notes CPU usage instead of API costs.

---

## Saved Items

Click the star icon on any item to save it. Saved items are preserved during the daily cleanup that removes items older than 30 days.

Access your saved items by clicking the Saved button (bookmark icon) in the header bar. This opens a filtered view showing only your saved items.

To unsave an item, click the star icon again to toggle it off.

---

## Keyboard Shortcuts

Navigate and act on items without reaching for the mouse. Press **?** at any time to see a shortcuts overlay in the app.

### Item Navigation

| Shortcut | Action |
|----------|--------|
| j / ↓ | Move focus to the next item |
| k / ↑ | Move focus to the previous item |
| Enter | Expand or collapse the focused item |
| o | Open the focused item's source in a new browser tab |
| s | Save or unsave the focused item |
| d | Dismiss the focused item |

The focused item is highlighted with a colored outline. Focus follows the visible page -- when you reach the last item, focus stays there (use the pagination controls to advance to the next page).

### General

| Shortcut | Action |
|----------|--------|
| / | Focus the search field (start typing immediately) |
| Escape | Clear item focus, or blur the search field |
| ? | Toggle the keyboard shortcuts help overlay |
| Cmd+, (macOS) / Ctrl+, (Windows) | Open Settings |

Keyboard shortcuts are disabled while typing in the search field or when a panel (Analysis, Sources, Settings, Saved) is open. Press Escape to return focus to the item list.

---

## Tips and Best Practices

### Writing Good Relevance Context

Your relevance context is the single most important configuration. Tips for writing an effective one:

- Name your specific role and organization type (e.g., "CTO at a mid-size fintech" rather than "tech leader").
- List your actual focus areas with specifics (e.g., "EU AI Act compliance with the August 2026 deadline" rather than just "AI regulation").
- Mention technologies you are actively evaluating or building with.
- Include domains adjacent to your core role that you need to track (e.g., a bank CTO might include quantum computing or supply chain risk).
- Update it when your priorities shift.

### Using Scoring Instructions Effectively

Scoring instructions supplement your relevance context with tactical guidance:

- Use them for time-sensitive priorities: "This week, boost anything related to the upcoming Senate AI hearing."
- Use them to suppress noise: "Deprioritize tutorial and how-to content unless it covers novel techniques."
- Use them to add nuance: "For research papers, prioritize empirical results over theoretical contributions."
- Keep them concise. A few well-chosen sentences are more effective than a long list.

### When to Mark Authoritative Sources

Mark a source as authoritative when:

- It is the primary/official publication for a major AI lab or institution (e.g., the OpenAI blog, not a news site reporting on OpenAI).
- It consistently produces content that is accurate and significant.
- You want items from that source to be weighted more heavily in critical item detection and briefings.

Do not mark every source as authoritative -- the designation loses its value if overused.

### Using Feedback to Improve Scoring

The thumbs up and thumbs down buttons on items provide explicit relevance feedback:

- **Thumbs up** on items that are genuinely valuable to your work. This tells the system "more like this."
- **Thumbs down** on items that scored high but are not actually useful. This tells the system "less like this."
- Be consistent. A few clear signals are better than thumbing everything.
- Feedback is most impactful on edge cases -- items that scored around 60-75% where the system was uncertain. Confirming or rejecting these helps calibrate future scoring.
