import { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import { api } from "../api.js";
import { CATEGORIES, mono, sans, timeAgo, relColor, healthColor, healthLabel } from "../constants.js";
import ItemHoverPopover from "./ItemHoverPopover.jsx";
import OrgBadge from "./OrgBadge.jsx";
import { PaywallPrompt } from "./services.jsx";

function SourcesPanel({ feeds, onClose, onRefresh }) {
  const [healthData, setHealthData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: "", url: "", category: "research" });
  const [addingFeed, setAddingFeed] = useState(false);
  const [addError, setAddError] = useState(null);
  const [expandedFeed, setExpandedFeed] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showRecs, setShowRecs] = useState(true);
  const [healthProgress, setHealthProgress] = useState(null); // { pct, message }
  const [showGaps, setShowGaps] = useState(false);
  const [gapsResult, setGapsResult] = useState(null);
  const [gapsSourceItems, setGapsSourceItems] = useState({});
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsError, setGapsError] = useState(null);
  const [gapsGeneratedAt, setGapsGeneratedAt] = useState(null);
  const [gapsCached, setGapsCached] = useState(false);
  const [gapsAddedFeeds, setGapsAddedFeeds] = useState(new Set());
  const [gapsAddingFeed, setGapsAddingFeed] = useState(null);
  const [gapsHoverItem, setGapsHoverItem] = useState(null);
  const gapsHoverTimerRef = useRef(null);
  const [llmLabel, setLlmLabel] = useState("");

  // Load feed health and any cached suggestions on mount (no expensive analysis)
  useEffect(() => {
    api.getFeedHealth().then(setHealthData).catch(() => {});
    api.getSuggestions().then(setSuggestions).catch(() => {});
    api.getSettings().then(s => {
      const provider = s.llmProvider || "anthropic";
      const model = s.llmModel || "";
      setLlmLabel(`${provider}${model ? ` / ${model}` : ""}`);
    }).catch(() => {});
  }, []);

  // Full health analysis via SSE with progress updates
  const runHealthCheck = () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);
    setHealthProgress({ pct: 5, message: "Starting health check..." });

    const evtSource = new EventSource("/api/health/analyze/stream");
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setHealthProgress({ pct: data.pct, message: data.message });
      } else if (data.type === "result") {
        setAnalysis(data.analysis);
        api.getSuggestions().then(setSuggestions).catch(() => {});
        setHealthProgress(null);
        setAnalyzing(false);
        evtSource.close();
      } else if (data.type === "error") {
        console.error("[Health]", data.message);
        setHealthProgress(null);
        setAnalyzing(false);
        evtSource.close();
      }
    };
    evtSource.onerror = () => {
      setHealthProgress(null);
      setAnalyzing(false);
      evtSource.close();
    };
  };

  const refreshHealth = () => api.getFeedHealth().then(setHealthData).catch(() => {});

  const runCoverageGaps = async (force = false) => {
    setGapsLoading(true);
    setGapsError(null);
    try {
      const data = await api.analyze("gaps", null, { force });
      // Normalize feed suggestion links in LLM output
      const normalized = (data.result || "")
        // Fix "[Name] (URL)" → "[Name](URL)" (space between ] and ()
        .replace(/\[([^\]]+)\]\s+\((https?:\/\/[^)]+)\)/g, "[$1]($2)")
        // Convert bare "- Name: URL" into markdown links
        .replace(/^([-•]\s*)(?:\*\*)?([^:\n[]+?)(?:\*\*)?:\s*(https?:\/\/[^\s]+)/gm, "$1[$2]($3)")
        // Convert "- Name (URL)" into markdown links
        .replace(/^([-•]\s*)([^(\n[]+?)\s*\((https?:\/\/[^\s)]+)\)/gm, "$1[$2]($3)");
      setGapsResult(normalized);
      if (data.sourceItems) setGapsSourceItems(data.sourceItems);
      if (data.generatedAt) setGapsGeneratedAt(data.generatedAt);
      setGapsCached(!!data.cached);
    } catch (e) {
      console.error("[Coverage Gaps]", e);
      setGapsError(e.message || "Analysis failed");
    }
    setGapsLoading(false);
  };

  const toggleCoverageGaps = async () => {
    if (showGaps) { setShowGaps(false); return; }
    setShowGaps(true);
    if (gapsResult) return; // already have results
    runCoverageGaps();
  };

  const handleGapsAddFeed = async (url, name) => {
    setGapsAddingFeed(url);
    try {
      await api.addFeed({ name: name || url, url, category: "research", id: `custom-${Date.now()}`, active: 1 });
      setGapsAddedFeeds(prev => new Set(prev).add(url));
      onRefresh();
    } catch (e) { console.error(e); }
    setGapsAddingFeed(null);
  };

  const handleGapsDismissFeed = (url) => {
    setGapsAddedFeeds(prev => { const s = new Set(prev); s.add(url); return s; }); // treat dismissed as "handled"
  };

  const clearGapsHoverTimer = () => {
    if (gapsHoverTimerRef.current) { clearTimeout(gapsHoverTimerRef.current); gapsHoverTimerRef.current = null; }
  };
  const dismissGapsHover = () => { clearGapsHoverTimer(); setGapsHoverItem(null); };

  const handleGapsSaveItem = async (item) => {
    try {
      await api.toggleSave(item.id, !item.saved);
      const updated = { ...item, saved: !item.saved };
      setGapsSourceItems(prev => ({ ...prev, [item.id]: updated }));
      setGapsHoverItem(h => h?.item?.id === item.id ? { ...h, item: updated } : h);
    } catch (e) { console.error(e); }
  };

  const handleGapsMarkRead = async (item) => {
    try { await api.markRead(item.id); dismissGapsHover(); } catch (e) { console.error(e); }
  };

  // Parse feed suggestions out of the markdown for card-style rendering.
  // Catches both #feed-URL and plain https:// URLs in markdown links.
  const parseFeedSuggestions = (md) => {
    if (!md) return [];
    const suggestions = [];
    const seen = new Set();
    // Match [Name](#feed-URL) — reason  OR  [Name](https://...) — reason
    const linkRegex = /\[([^\]]+)\]\((#feed-|https?:\/\/)([^)]+)\)\s*[—\-–]?\s*(.*)/g;
    let m;
    while ((m = linkRegex.exec(md)) !== null) {
      const url = m[2] === "#feed-" ? m[3] : m[2] + m[3];
      if (url.startsWith("#item-")) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      suggestions.push({ name: m[1], url, reason: m[4].trim() });
    }
    // Also match bare URLs on suggestion lines: "- Name: https://... — reason" or "- Name (https://...) — reason"
    const bareRegex = /[-•]\s*([^:\n(]+?)(?::\s*|\s*\()(https?:\/\/[^\s)]+)\)?\s*[—\-–]?\s*(.*)/g;
    while ((m = bareRegex.exec(md)) !== null) {
      const url = m[2];
      if (seen.has(url)) continue;
      seen.add(url);
      suggestions.push({ name: m[1].trim(), url, reason: m[3].trim() });
    }
    return suggestions;
  };

  // Markdown link renderer for coverage gaps
  // #item- links → hover popovers; feed suggestion URLs → plain text (rendered as cards below)
  const gapsFeedUrls = new Set(parseFeedSuggestions(gapsResult).map(s => s.url));

  const renderGapsLink = ({ href, children }) => {
    const itemMatch = href?.match(/^#item-(.+)$/);
    if (itemMatch) {
      const itemId = itemMatch[1];
      const found = gapsSourceItems[itemId];
      return (
        <a href={found?.url || "#"} target="_blank" rel="noopener noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)", fontWeight: found ? 500 : 400 }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            clearGapsHoverTimer();
            gapsHoverTimerRef.current = setTimeout(() => {
              if (found) setGapsHoverItem({ item: found, anchor: el });
            }, 500);
          }}
          onMouseLeave={() => {
            clearGapsHoverTimer();
            gapsHoverTimerRef.current = setTimeout(dismissGapsHover, 200);
          }}>
          {children}
        </a>
      );
    }
    // Feed suggestion URLs: render as inline card with Add/dismiss buttons
    if (href?.startsWith("#feed-") || gapsFeedUrls.has(href)) {
      const feedUrl = href.startsWith("#feed-") ? href.slice(6) : href;
      const name = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "Source";
      const alreadyAdded = gapsAddedFeeds.has(feedUrl);
      const isAdding = gapsAddingFeed === feedUrl;
      if (alreadyAdded) return <span style={{ color: "#10B981", fontSize: 11, fontFamily: mono }}>✓ {name} added</span>;
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", margin: "2px 0", background: "var(--suggestion-bg)", border: "1px solid var(--accent-border-subtle)", borderRadius: 5 }}>
          <span style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 500 }}>{name}</span>
          <button onClick={() => handleGapsAddFeed(feedUrl, name)} disabled={isAdding}
            style={{ padding: "1px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600, opacity: isAdding ? 0.6 : 1 }}>
            {isAdding ? "..." : "Add"}
          </button>
          <button onClick={() => handleGapsDismissFeed(feedUrl)}
            style={{ padding: "1px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
        </span>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}>{children}</a>;
  };

  const toggleMute = async (feed) => {
    await api.updateFeed(feed.id, { active: feed.active ? 0 : 1 });
    onRefresh();
    refreshHealth();
  };

  const toggleAuthoritative = async (e, feed) => {
    e.stopPropagation();
    await api.updateFeed(feed.id, { authoritative: feed.authoritative ? 0 : 1 });
    onRefresh();
  };

  const removeFeed = async (feed) => {
    try {
      await api.deleteFeed(feed.id);
      // Optimistically remove from local state so UI updates immediately
      setHealthData(prev => prev ? prev.filter(f => f.id !== feed.id) : prev);
      setConfirmDelete(null);
      setExpandedFeed(null);
      onRefresh();
      refreshHealth();
    } catch (e) { console.error("Delete failed:", e); }
  };

  const acceptSuggestion = async (s) => {
    try {
      await api.acceptSuggestion(s.id);
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
      onRefresh();
      refreshHealth();
    } catch (e) { console.error(e); }
  };

  const dismissSuggestion = async (s) => {
    try {
      await api.dismissSuggestion(s.id);
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
    } catch (e) { console.error(e); }
  };

  const addFeed = async () => {
    if (!newFeed.url) return;
    setAddingFeed(true);
    setAddError(null);
    try {
      // Name is optional — backend will infer from RSS title, or we derive from URL
      const name = newFeed.name || new URL(newFeed.url).hostname.replace(/^www\./, "");
      await api.addFeed({ name, url: newFeed.url, category: newFeed.category, id: `custom-${Date.now()}`, active: 1 });
      setNewFeed({ name: "", url: "", category: "research" });
      setShowAddForm(false);
      onRefresh();
    } catch (e) {
      setAddError(e.message);
    }
    setAddingFeed(false);
  };

  const enriched = (healthData || feeds).filter(f => f.type !== "x-account");
  const activeCount = enriched.filter(f => f.active).length;
  const mutedCount = enriched.filter(f => !f.active).length;
  const hasSuggestions = suggestions.length > 0;

  const inp = { padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 13, fontFamily: sans, outline: "none", width: "100%" };

  const staleIds = new Set((analysis?.stale || []).map(s => s.id));
  const noisyIds = new Set((analysis?.noisy || []).map(s => s.id));
  const staleMap = Object.fromEntries((analysis?.stale || []).map(s => [s.id, s.reason]));
  const noisyMap = Object.fromEntries((analysis?.noisy || []).map(s => [s.id, s.reason]));

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: `-8px 0 32px var(--shadow-panel)` }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-primary)", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>📡 SOURCES</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      {/* Summary bar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: mono }}>
            Active: <span style={{ color: "#10B981" }}>{activeCount}</span>
            {mutedCount > 0 && <> · Muted: <span style={{ color: "var(--text-faint)" }}>{mutedCount}</span></>}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: showAddForm ? "var(--accent-bg)" : "transparent", color: showAddForm ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>+ Add Source</button>
            <button onClick={runHealthCheck} disabled={analyzing} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: analyzing ? "var(--accent-bg)" : "transparent", color: analyzing ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
              {analyzing ? "Checking..." : "Health Check"}
            </button>
            <button onClick={toggleCoverageGaps} disabled={gapsLoading} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: (showGaps || gapsLoading) ? "var(--accent-bg)" : "transparent", color: (showGaps || gapsLoading) ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
              {gapsLoading ? "Analyzing..." : showGaps ? "← Sources" : "Coverage Gaps"}
            </button>
          </div>
        </div>
        {healthProgress && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: mono }}>{healthProgress.message}</span>
              <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>{healthProgress.pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "var(--accent)", width: `${healthProgress.pct}%`, transition: "width 0.4s ease" }} />
            </div>
          </div>
        )}
      </div>

      {/* Add feed form */}
      {showAddForm && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-form)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="Paste a URL — RSS, X profile, YouTube channel, blog, newsletter..." value={newFeed.url} onChange={e => setNewFeed(p => ({ ...p, url: e.target.value }))} style={inp} onKeyDown={e => e.key === "Enter" && addFeed()} autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Name (optional — auto-detected)" value={newFeed.name} onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))} style={{ ...inp, flex: 1 }} />
              <select value={newFeed.category} onChange={e => setNewFeed(p => ({ ...p, category: e.target.value }))} style={{ ...inp, flex: 1 }}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {addError && <div style={{ color: "#EF4444", fontSize: 11, fontFamily: mono }}>{addError}</div>}
            <button onClick={addFeed} disabled={addingFeed || !newFeed.url} style={{ padding: 10, background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontFamily: mono, fontSize: 12, cursor: "pointer", fontWeight: 600, opacity: addingFeed ? 0.6 : 1 }}>
              {addingFeed ? "Adding..." : "Add Source"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--error-bg-strong)" }}>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: sans, marginBottom: 8 }}>
            Delete <strong>{confirmDelete.name}</strong>? This will remove this source and all its items.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => removeFeed(confirmDelete)} style={{ padding: "6px 14px", background: "#EF4444", border: "none", borderRadius: 5, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Delete</button>
            <button onClick={() => setConfirmDelete(null)} style={{ padding: "6px 14px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 11, fontFamily: mono, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Scrollable content — sources list or coverage gaps */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {showGaps ? (
          /* Coverage Gaps view */
          <div style={{ padding: "16px 20px" }}>
            {gapsLoading && <div style={{ color: "var(--text-muted)", fontFamily: mono, fontSize: 12, padding: "20px 0" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.5s infinite", marginRight: 8 }} />Analyzing coverage gaps — this may take 30-60 seconds...</div>}
            {gapsError && <div style={{ color: "#EF4444", fontFamily: mono, fontSize: 11, padding: "8px 10px", background: "var(--error-bg)", borderRadius: 5 }}>⚠ {gapsError}</div>}
            {gapsResult && (
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.7, fontFamily: sans }}>
                {llmLabel && <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: sans, fontStyle: "italic", marginBottom: 4 }}>Powered by {llmLabel}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>
                    {gapsGeneratedAt ? `Generated ${timeAgo(gapsGeneratedAt)}` : ""}
                    {gapsCached && " (cached)"}
                  </span>
                  <button onClick={() => runCoverageGaps(true)} disabled={gapsLoading} style={{
                    padding: "3px 10px", background: "none", border: "1px solid var(--border)",
                    borderRadius: 4, color: "var(--text-muted)", fontSize: 9, fontFamily: mono, cursor: "pointer",
                    opacity: gapsLoading ? 0.5 : 1,
                  }}>Regenerate</button>
                </div>
                <Markdown components={{
                  h3: ({ children }) => <h3 style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600, fontFamily: mono, marginTop: 16, marginBottom: 6 }}>{children}</h3>,
                  p: ({ children }) => <p style={{ marginTop: 0, marginBottom: 8 }}>{children}</p>,
                  strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                  ul: ({ children }) => <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 8 }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom: 6, color: "var(--text-secondary)" }}>{children}</li>,
                  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />,
                  a: renderGapsLink,
                }}>{gapsResult}</Markdown>
              </div>
            )}
            {gapsHoverItem && <ItemHoverPopover item={gapsHoverItem.item} anchor={gapsHoverItem.anchor} onClose={dismissGapsHover} onSave={handleGapsSaveItem} onMarkRead={handleGapsMarkRead} onMouseEnter={clearGapsHoverTimer} />}
          </div>
        ) : (
        /* Sources list view */
        <>
        {Object.entries(CATEGORIES).map(([ck, cat]) => {
          const catFeeds = enriched.filter(f => f.category === ck);
          const catSuggestions = suggestions.filter(s => s.category === ck).slice(0, 3);
          if (!catFeeds.length && !catSuggestions.length) return null;
          const active = catFeeds.filter(f => f.active);
          const muted = catFeeds.filter(f => !f.active);
          const sorted = [...active, ...muted];

          return (
            <div key={ck} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ color: cat.color, fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 8 }}>
                {cat.icon} {cat.label.toUpperCase()} ({active.length})
              </div>
              {sorted.map(f => {
                const isStale = staleIds.has(f.id);
                const isNoisy = noisyIds.has(f.id);
                const avgRel = f.computed_avg_relevance || f.avg_relevance || 0;
                const status = f.health_status || "unknown";
                const dotColor = healthColor(status);
                const dotTitle = healthLabel(status, f.avg_interval_hours, f.hours_since_last);
                const isExpanded = expandedFeed === f.id;

                return (
                  <div key={f.id}>
                    <div onClick={() => setExpandedFeed(isExpanded ? null : f.id)} style={{ padding: "8px 10px", marginBottom: 2, borderRadius: 6, background: isExpanded ? "var(--bg-elevated)" : !f.active ? "var(--muted-item-bg)" : status === "error" ? "var(--error-bg)" : "transparent", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: 8 }}>
                          <span title={dotTitle} style={{ width: 7, height: 7, borderRadius: "50%", background: f.active ? dotColor : "var(--text-disabled)", flexShrink: 0 }} />
                          <span style={{ color: f.active ? "var(--text-secondary)" : "var(--text-faint)", fontSize: 12.5, fontFamily: sans, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          {f.authoritative && <span title="Authoritative source" style={{ color: "var(--accent)", fontSize: 10, flexShrink: 0 }}>◆</span>}
                          <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, flexShrink: 0 }}>{f.type}</span>
                          {f.paywall && <span title="Paywalled — authenticate for full content" style={{ padding: "0 4px", borderRadius: 3, fontSize: 8, fontFamily: mono, fontWeight: 600, background: "#F59E0B20", color: "#F59E0B", flexShrink: 0 }}>paywall</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {!f.active && <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, marginRight: 2 }}>MUTED</span>}
                          <button onClick={e => { e.stopPropagation(); toggleMute(f); }} title={f.active ? "Mute source" : "Unmute source"}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", lineHeight: 1 }}>
                            {f.active
                              ? <span style={{ color: "#10B981" }}>🎙</span>
                              : <span style={{ color: "#EF4444" }}>🔇</span>}
                          </button>
                          {!f.active && (
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete(f); }} title="Delete source"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 12, padding: "2px 4px" }}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      {f.active && (
                        <div style={{ display: "flex", gap: 12, marginTop: 4, paddingLeft: 15 }}>
                          <span style={{ color: relColor(avgRel), fontSize: 10, fontFamily: mono }}>Rel: {(avgRel * 100).toFixed(0)}%</span>
                          <span style={{ color: dotColor, fontSize: 10, fontFamily: mono }}>{timeAgo(f.latest_item)}</span>
                          <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>Items: {f.live_items ?? f.item_count ?? 0}</span>
                          {f.last_error && <span style={{ color: "#EF4444", fontSize: 10, fontFamily: mono }} title={f.last_error}>⚠ {f.last_error.slice(0, 30)}</span>}
                        </div>
                      )}
                      {isStale && <div style={{ color: "#F59E0B", fontSize: 10, fontFamily: mono, marginTop: 3, paddingLeft: 15 }}>⚠ Stale: {staleMap[f.id]}</div>}
                      {isNoisy && <div style={{ color: "#F97316", fontSize: 10, fontFamily: mono, marginTop: 3, paddingLeft: 15 }}>⚠ Noisy: {noisyMap[f.id]}</div>}
                    </div>
                    {/* Expanded feed detail */}
                    {isExpanded && (
                      <div style={{ padding: "10px 14px 12px 25px", marginBottom: 4, background: "var(--bg-elevated)", borderRadius: "0 0 6px 6px", borderTop: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div>
                            <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>URL</div>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 11, fontFamily: mono, wordBreak: "break-all", textDecoration: "none" }}>{f.url}</a>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>RELEVANCE</div>
                              <span style={{ color: relColor(avgRel), fontSize: 12, fontFamily: mono, fontWeight: 600 }}>{(avgRel * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>HEALTH</div>
                              <span style={{ color: dotColor, fontSize: 12, fontFamily: mono, fontWeight: 600 }}>{dotTitle}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>CADENCE</div>
                              <span style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: mono }}>
                                {f.avg_interval_hours != null
                                  ? f.avg_interval_hours < 24 ? "~daily" : f.avg_interval_hours < 72 ? "~every few days" : f.avg_interval_hours < 168 ? "~weekly" : `~every ${Math.round(f.avg_interval_hours / 24)}d`
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>ITEMS</div>
                              <span style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: mono }}>{f.live_items ?? f.item_count ?? 0}</span>
                            </div>
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>CATEGORY</div>
                              <span style={{ color: cat.color, fontSize: 11, fontFamily: mono }}>{cat.label}</span>
                            </div>
                          </div>
                          {f.last_error && (
                            <div>
                              <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>ERROR</div>
                              <span style={{ color: "#EF4444", fontSize: 11, fontFamily: mono }}>{f.last_error}</span>
                            </div>
                          )}
                          <label onClick={e => toggleAuthoritative(e, f)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 4 }}>
                            <input type="checkbox" checked={!!f.authoritative} readOnly
                              style={{ accentColor: "var(--accent)", width: 13, height: 13, cursor: "pointer" }} />
                            <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: mono }}>Authoritative source</span>
                            <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: sans }}> — items from this source count toward critical alerts</span>
                          </label>
                          {f.paywall && <PaywallPrompt feed={f} onConnect={handleServiceConnect} />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Per-category recommendations (top 3) */}
              {showRecs && catSuggestions.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border-dashed)" }}>
                  <div style={{ color: "var(--accent)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 6, letterSpacing: "0.05em" }}>SUGGESTED</div>
                  {catSuggestions.map(s => (
                    <div key={s.id} style={{ padding: "6px 10px", marginBottom: 4, background: "var(--suggestion-bg)", border: "1px solid var(--accent-border-subtle)", borderRadius: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>{s.name}</span>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => acceptSuggestion(s)} style={{ padding: "2px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Add</button>
                          <button onClick={() => dismissSuggestion(s)} style={{ padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
                        </div>
                      </div>
                      {s.reason && <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>{s.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Uncategorized suggestions */}
        {showRecs && suggestions.filter(s => !CATEGORIES[s.category]).length > 0 && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ color: "var(--accent)", fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 8 }}>SUGGESTED</div>
            {suggestions.filter(s => !CATEGORIES[s.category]).slice(0, 3).map(s => (
              <div key={s.id} style={{ padding: "6px 10px", marginBottom: 4, background: "var(--suggestion-bg)", border: "1px solid var(--accent-border-subtle)", borderRadius: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>{s.name}</span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => acceptSuggestion(s)} style={{ padding: "2px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Add</button>
                    <button onClick={() => dismissSuggestion(s)} style={{ padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
                {s.reason && <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>{s.reason}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Recommendations toggle / health check prompt */}
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {hasSuggestions && (
            <button onClick={() => setShowRecs(!showRecs)} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, fontFamily: mono, cursor: "pointer", padding: 0 }}>
              {showRecs ? "▾ Hide recommendations" : "▸ Show recommendations"}
            </button>
          )}
          {!hasSuggestions && !analysis && (
            <div style={{ color: "var(--text-faint)", fontSize: 11, fontFamily: sans }}>
              Run a Health Check to get AI-powered source recommendations.
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default SourcesPanel;
