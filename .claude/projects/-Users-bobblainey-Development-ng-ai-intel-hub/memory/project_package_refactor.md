---
name: Package system refactor
description: TODO — refactor domain-specific config into a package system to support multiple domains (AI research, investment research, etc.)
type: project
---

Refactor the app from a hardcoded AI research tool into a generic research platform with domain-specific "packages".

**Why:** The core platform (feed aggregation, LLM scoring, filtering, analysis) is domain-agnostic. Only the configuration is AI-specific. Extracting this into packages enables reuse for investment research, pharma, semiconductors, sports, entertainment, etc.

**How to apply:** When the user is ready to proceed, extract all domain-specific config into a package structure. The current AI research behavior becomes the default package. Second target domain is investment research.

**Package structure:**
- `categories` — domain-specific category definitions (labels, colors, icons)
- `feeds` — curated default sources
- `organizations` / `entities` — org registry, feed-org map, entity types (companies, sectors, instruments for finance)
- `analysisModes` — per-mode label, description, item selection strategy, prompt templates (Morning Brief / Risk Radar / Catalyst Calendar for finance vs Daily Summary / Risk Scan / WSNW for AI)
- `curatedFeeds` — health analysis suggestion pool
- `tagPatterns` — domain-specific tag detection
- `criticalCriteria` — what counts as critical in this domain
- `branding` — title, icon, default relevance context, prompt tone

**Investment research package specifics:**
- Categories: Macro, Equities, Fixed Income, Commodities/FX, Regulatory/Central Banks, Alternatives
- Sources: central bank feeds, SEC EDGAR, sell-side research (paywalled), FT/Bloomberg/WSJ, market-focused Substacks/X accounts
- Orgs: banks, asset managers, central banks, regulators, rating agencies
- New platform capability needed: entity/watchlist tracking (companies, tickers, sectors, instruments) — LLM tags items with mentioned entities during scoring, sidebar filter shows watched entities
- Analysis modes: Morning Brief, Thematic Scan, Risk Radar, Catalyst Calendar

**Refactoring steps:**
1. Extract all domain-specific config into `packages/ai-research.js`
2. Add `loadPackage(id)` function called at startup
3. Scorer reads prompts/modes from package, frontend reads categories/branding from package
4. Add package selector in settings or first-launch wizard
5. Build investment research as second package
6. Add entity/watchlist tracking as new platform capability (generalizes orgs concept)
