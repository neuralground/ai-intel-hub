import { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import { api } from "./api.js";
import { useTheme } from "./useTheme.js";

const CATEGORIES = {
  research: { label: "AI Research", color: "#4F8EF7", icon: "🔬" },
  engineering: { label: "Engineering & Practice", color: "#10B981", icon: "⚙️" },
  industry: { label: "Industry & Capital", color: "#F59E0B", icon: "💰" },
  policy: { label: "Policy & Governance", color: "#EF4444", icon: "🏛️" },
  labs: { label: "AI Labs", color: "#8B5CF6", icon: "🏢" },
};

const mono = "'JetBrains Mono', monospace";
const sans = "'IBM Plex Sans', sans-serif";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function relColor(r) {
  if (r >= 0.85) return "#10B981";
  if (r >= 0.65) return "#F59E0B";
  if (r >= 0.4) return "#6B7280";
  return "#4B5563";
}

function healthColor(status) {
  if (status === "error") return "#EF4444";
  if (status === "delayed") return "#F59E0B";
  if (status === "unknown") return "#4B5563";
  return "#10B981";
}

function healthLabel(status, avgInterval, hoursSince) {
  if (status === "error") return "Feed error";
  if (status === "unknown") return "No items yet";
  const cadence = avgInterval != null
    ? avgInterval < 24 ? "~daily" : avgInterval < 72 ? "~every few days" : avgInterval < 168 ? "~weekly" : "~monthly"
    : null;
  const since = hoursSince != null
    ? hoursSince < 1 ? "just now" : hoursSince < 24 ? `${Math.round(hoursSince)}h ago` : `${Math.round(hoursSince / 24)}d ago`
    : "—";
  if (status === "delayed") return `Delayed — last post ${since}${cadence ? `, usually ${cadence}` : ""}`;
  return `Healthy — last post ${since}${cadence ? `, ${cadence}` : ""}`;
}

// ── Theme Toggle ────────────────────────────────────────────────────────────
function ThemeToggle({ mode, setMode }) {
  const options = [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  return (
    <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
      {options.map(o => (
        <button key={o.key} onClick={() => setMode(o.key)} style={{
          padding: "4px 10px", border: "none", fontSize: 10, fontFamily: mono, cursor: "pointer",
          background: mode === o.key ? "var(--accent-bg)" : "transparent",
          color: mode === o.key ? "var(--accent)" : "var(--text-faint)",
          borderRight: o.key !== "dark" ? "1px solid var(--border)" : "none",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ── Item Hover Popover (used in Analysis Panel) ─────────────────────────────
// Appears on delayed hover over source links. Positioned near the trigger element.
function ItemHoverPopover({ item, anchor, onClose, onSave, onMarkRead, onMouseEnter }) {
  if (!item || !anchor) return null;
  const cat = CATEGORIES[item.category] || { color: "#6B7280", label: item.category };

  // Position below the anchor element, clamped to viewport
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 380;
  let left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
  let top = rect.bottom + 6;
  const fitsBelow = top + 300 < window.innerHeight;
  if (!fitsBelow) top = Math.max(8, rect.top - 310);

  return (
    <div style={{ position: "fixed", top, left, width: popoverWidth, maxHeight: 340, overflow: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.35)", padding: 14, zIndex: 210 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, background: cat.color + "15", color: cat.color, fontFamily: mono, fontWeight: 600 }}>{cat.label}</span>
        <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, background: relColor(item.relevance) + "15", color: relColor(item.relevance), fontFamily: mono, fontWeight: 600 }}>{(item.relevance * 100).toFixed(0)}%</span>
        <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono }}>{item.feed_id} · {timeAgo(item.published)}</span>
      </div>
      <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 5 }}>{item.title}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.5, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.summary}</div>
      {item.relevance_reason && (
        <div style={{ padding: "6px 10px", background: "var(--accent-bg-subtle)", border: "1px solid var(--accent-border)", borderRadius: 5, marginBottom: 8 }}>
          <div style={{ color: "var(--accent)", fontSize: 9, fontFamily: mono, marginBottom: 2, fontWeight: 600 }}>WHY THIS MATTERS</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.4 }}>{item.relevance_reason}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 5 }}>
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: "4px 10px", background: "var(--accent)", borderRadius: 5, color: "white", fontSize: 10, fontFamily: mono, textDecoration: "none", fontWeight: 600 }}>Open →</a>}
        <button onClick={e => { e.stopPropagation(); onMarkRead(item); }} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", fontSize: 10, fontFamily: mono }}>✓ Read</button>
        <button onClick={e => { e.stopPropagation(); onSave(item); }} style={{ padding: "4px 10px", background: item.saved ? "var(--accent-bg)" : "transparent", border: `1px solid ${item.saved ? "var(--accent)" : "var(--border)"}`, borderRadius: 5, color: item.saved ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 10, fontFamily: mono }}>
          {item.saved ? "★ Saved" : "☆ Save"}
        </button>
      </div>
    </div>
  );
}

// ── Analysis Panel ──────────────────────────────────────────────────────────
function AnalysisPanel({ category, onClose }) {
  const [mode, setMode] = useState("briefing");
  const [result, setResult] = useState("");
  const [sourceItems, setSourceItems] = useState({});
  const [hoverItem, setHoverItem] = useState(null); // { item, anchor }
  const hoverTimerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult("");
    setSourceItems({});
    setHoverItem(null);
    try {
      const data = await api.analyze(mode, category !== "all" ? category : null);
      setResult(data.result);
      if (data.sourceItems) setSourceItems(data.sourceItems);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [mode, category]);

  useEffect(() => { run(); }, [run]);

  const showItemHover = (itemId, anchorEl) => {
    const item = sourceItems[itemId];
    if (item) setHoverItem({ item, anchor: anchorEl });
  };

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  };

  const dismissHover = () => { clearHoverTimer(); setHoverItem(null); };

  const handleSaveItem = async (item) => {
    try {
      await api.toggleSave(item.id, !item.saved);
      const updated = { ...item, saved: !item.saved };
      setSourceItems(prev => ({ ...prev, [item.id]: updated }));
      setHoverItem(h => h?.item?.id === item.id ? { ...h, item: updated } : h);
    } catch (e) { console.error(e); }
  };

  const handleMarkReadFromHover = async (item) => {
    try {
      await api.markRead(item.id);
      dismissHover();
    } catch (e) { console.error(e); }
  };

  // Track feeds added from gap suggestions
  const [addedFeeds, setAddedFeeds] = useState(new Set());
  const [addingFeed, setAddingFeed] = useState(null);

  const handleAddFeed = async (url, name) => {
    setAddingFeed(url);
    try {
      await api.addFeed({ name: name || url, url, category: "research", id: `custom-${Date.now()}`, active: 1 });
      setAddedFeeds(prev => new Set(prev).add(url));
    } catch (e) { console.error(e); }
    setAddingFeed(null);
  };

  const modes = [
    { key: "briefing", label: "Executive Brief" },
    { key: "risks", label: "Risk Scan" },
    { key: "what-so-what-now-what", label: "What / So What / Now What" },
  ];

  // Custom link renderer:
  //   item:ID  → opens item popover
  //   feed:URL → shows source name + inline Add button
  //   other    → opens externally
  const renderLink = ({ href, children }) => {
    const itemMatch = href?.match(/^#item-(.+)$/);
    if (itemMatch) {
      const itemId = itemMatch[1];
      const found = sourceItems[itemId];
      // Click goes to source URL; hover-delay shows popover
      return (
        <a href={found?.url || "#"} target="_blank" rel="noopener noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)", fontWeight: found ? 500 : 400 }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            clearHoverTimer();
            hoverTimerRef.current = setTimeout(() => showItemHover(itemId, el), 500);
          }}
          onMouseLeave={() => {
            clearHoverTimer();
            // Delay dismiss so user can move mouse into the popover
            hoverTimerRef.current = setTimeout(dismissHover, 200);
          }}>
          {children}
        </a>
      );
    }
    const feedMatch = href?.match(/^#feed-(.+)$/);
    if (feedMatch) {
      const feedUrl = feedMatch[1];
      const name = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "Source";
      const alreadyAdded = addedFeeds.has(feedUrl);
      const isAdding = addingFeed === feedUrl;
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <a href={feedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}>{children}</a>
          {alreadyAdded ? (
            <span style={{ padding: "1px 6px", borderRadius: 3, background: "rgba(16,185,129,0.15)", color: "#10B981", fontSize: 9, fontFamily: mono, fontWeight: 600 }}>Added</span>
          ) : (
            <button onClick={() => handleAddFeed(feedUrl, name)} disabled={isAdding} style={{ padding: "1px 6px", borderRadius: 3, background: "var(--accent)", color: "white", border: "none", fontSize: 9, fontFamily: mono, fontWeight: 600, cursor: "pointer", opacity: isAdding ? 0.6 : 1 }}>
              {isAdding ? "..." : "+ Add"}
            </button>
          )}
        </span>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}>{children}</a>;
  };

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: `-8px 0 32px var(--shadow-panel)` }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-primary)", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>🧠 INTEL BRIEF</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {modes.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 11, fontFamily: mono,
            borderColor: mode === m.key ? "var(--accent)" : "var(--border)", cursor: "pointer",
            background: mode === m.key ? "var(--accent-bg)" : "transparent",
            color: mode === m.key ? "var(--accent)" : "var(--text-muted)",
          }}>{m.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {loading && <div style={{ color: "var(--text-muted)", fontFamily: mono, fontSize: 13 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.5s infinite", marginRight: 8 }} />Analyzing...</div>}
        {error && <div style={{ color: "#EF4444", fontFamily: mono, fontSize: 13 }}>⚠ {error}</div>}
        {result && <div className="analysis-markdown" style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.75, fontFamily: sans }}><Markdown components={{
          h1: ({ children }) => <h1 style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 600, fontFamily: mono, marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600, fontFamily: mono, marginTop: 18, marginBottom: 8 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ color: "var(--text-secondary)", fontSize: 13.5, fontWeight: 600, fontFamily: mono, marginTop: 14, marginBottom: 6 }}>{children}</h3>,
          p: ({ children }) => <p style={{ marginTop: 0, marginBottom: 10 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--text-secondary)" }}>{children}</li>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />,
          code: ({ children, inline }) => inline !== false
            ? <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4, fontSize: 12, fontFamily: mono, color: "var(--accent)" }}>{children}</code>
            : <pre style={{ background: "var(--bg-elevated)", padding: 12, borderRadius: 6, overflow: "auto", fontSize: 12, fontFamily: mono, color: "var(--text-secondary)", margin: "8px 0" }}><code>{children}</code></pre>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 14, margin: "10px 0", color: "var(--text-muted)" }}>{children}</blockquote>,
          a: renderLink,
        }}>{result}</Markdown></div>}
      </div>
      {hoverItem && <ItemHoverPopover item={hoverItem.item} anchor={hoverItem.anchor} onClose={dismissHover} onSave={handleSaveItem} onMarkRead={handleMarkReadFromHover} onMouseEnter={clearHoverTimer} />}
    </div>
  );
}

// ── Sources Panel ───────────────────────────────────────────────────────────
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
  const [gapsAddedFeeds, setGapsAddedFeeds] = useState(new Set());
  const [gapsAddingFeed, setGapsAddingFeed] = useState(null);
  const [gapsHoverItem, setGapsHoverItem] = useState(null);
  const gapsHoverTimerRef = useRef(null);

  // Load feed health and any cached suggestions on mount (no expensive analysis)
  useEffect(() => {
    api.getFeedHealth().then(setHealthData).catch(() => {});
    api.getSuggestions().then(setSuggestions).catch(() => {});
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

  const toggleCoverageGaps = async () => {
    if (showGaps) { setShowGaps(false); return; }
    setShowGaps(true);
    if (gapsResult) return; // already have results
    setGapsLoading(true);
    setGapsError(null);
    try {
      const data = await api.analyze("gaps", null);
      setGapsResult(data.result);
      if (data.sourceItems) setGapsSourceItems(data.sourceItems);
    } catch (e) {
      console.error("[Coverage Gaps]", e);
      setGapsError(e.message || "Analysis failed");
    }
    setGapsLoading(false);
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

  // Parse feed suggestions out of the markdown for card-style rendering
  const parseFeedSuggestions = (md) => {
    if (!md) return [];
    const suggestions = [];
    const regex = /\[([^\]]+)\]\(#feed-([^)]+)\)\s*—?\s*(.*)/g;
    let m;
    while ((m = regex.exec(md)) !== null) {
      suggestions.push({ name: m[1], url: m[2], reason: m[3].trim() });
    }
    return suggestions;
  };

  // Strip #feed- links from markdown (they'll be rendered as cards instead)
  const stripFeedLinks = (md) => {
    if (!md) return md;
    // Remove entire list items that are just feed suggestions
    return md.replace(/^-\s*\[[^\]]+\]\(#feed-[^)]+\)\s*—?.*$/gm, "").replace(/\n{3,}/g, "\n\n");
  };

  // Markdown link renderer for coverage gaps — #item- links get hover popovers
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
    // Don't render #feed- as links — they're rendered as cards separately
    const feedMatch = href?.match(/^#feed-/);
    if (feedMatch) return <span style={{ color: "var(--text-secondary)" }}>{children}</span>;
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}>{children}</a>;
  };

  const toggleMute = async (feed) => {
    await api.updateFeed(feed.id, { active: feed.active ? 0 : 1 });
    onRefresh();
    refreshHealth();
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
            <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: showAddForm ? "var(--accent-bg)" : "transparent", color: showAddForm ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>+ Add Feed</button>
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
            <input placeholder="Paste a URL — RSS feed, X profile, YouTube channel, blog..." value={newFeed.url} onChange={e => setNewFeed(p => ({ ...p, url: e.target.value }))} style={inp} onKeyDown={e => e.key === "Enter" && addFeed()} autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Name (optional — auto-detected)" value={newFeed.name} onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))} style={{ ...inp, flex: 1 }} />
              <select value={newFeed.category} onChange={e => setNewFeed(p => ({ ...p, category: e.target.value }))} style={{ ...inp, flex: 1 }}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {addError && <div style={{ color: "#EF4444", fontSize: 11, fontFamily: mono }}>{addError}</div>}
            <button onClick={addFeed} disabled={addingFeed || !newFeed.url} style={{ padding: 10, background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontFamily: mono, fontSize: 12, cursor: "pointer", fontWeight: 600, opacity: addingFeed ? 0.6 : 1 }}>
              {addingFeed ? "Adding..." : "Add Feed"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--error-bg-strong)" }}>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: sans, marginBottom: 8 }}>
            Delete <strong>{confirmDelete.name}</strong>? This will remove the feed and all its items.
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
              <>
                <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.7, fontFamily: sans }}>
                  <Markdown components={{
                    h3: ({ children }) => <h3 style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600, fontFamily: mono, marginTop: 16, marginBottom: 6 }}>{children}</h3>,
                    p: ({ children }) => <p style={{ marginTop: 0, marginBottom: 8 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                    ul: ({ children }) => <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 8 }}>{children}</ul>,
                    li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--text-secondary)" }}>{children}</li>,
                    hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />,
                    a: renderGapsLink,
                  }}>{stripFeedLinks(gapsResult)}</Markdown>
                </div>
                {/* Suggested sources as cards */}
                {parseFeedSuggestions(gapsResult).length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ color: "var(--accent)", fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>SUGGESTED SOURCES</div>
                    {parseFeedSuggestions(gapsResult).filter(s => !gapsAddedFeeds.has(s.url)).map((s, i) => (
                      <div key={i} style={{ padding: "8px 12px", marginBottom: 6, background: "var(--suggestion-bg)", border: "1px solid var(--accent-border-subtle)", borderRadius: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>{s.name}</span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button onClick={() => handleGapsAddFeed(s.url, s.name)} disabled={gapsAddingFeed === s.url}
                              style={{ padding: "2px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600, opacity: gapsAddingFeed === s.url ? 0.6 : 1 }}>
                              {gapsAddingFeed === s.url ? "..." : "Add"}
                            </button>
                            <button onClick={() => handleGapsDismissFeed(s.url)}
                              style={{ padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
                          </div>
                        </div>
                        {s.reason && <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>{s.reason}</div>}
                        <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, marginTop: 2 }}>{s.url}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
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
                          <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, flexShrink: 0 }}>{f.type}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {!f.active && <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, marginRight: 2 }}>MUTED</span>}
                          <button onClick={e => { e.stopPropagation(); toggleMute(f); }} title={f.active ? "Mute feed" : "Unmute feed"}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", lineHeight: 1 }}>
                            {f.active
                              ? <span style={{ color: "#10B981" }}>🎙</span>
                              : <span style={{ color: "#EF4444" }}>🔇</span>}
                          </button>
                          {!f.active && (
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete(f); }} title="Delete feed"
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
              Run a Health Check to get AI-powered feed recommendations.
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// ── Service brand icons (inline SVG) ────────────────────────────────────────
const SvcIcon = ({ d, viewBox = "0 0 24 24", size = 16, color }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={color} xmlns="http://www.w3.org/2000/svg">
    <path d={d} />
  </svg>
);

const SERVICE_ICONS = {
  twitter: (color) => <SvcIcon color={color} d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
  substack: (color) => <SvcIcon color={color} d="M22.539 8.242H1.46V5.406h21.08zM1.46 10.812V24L12 18.11 22.54 24V10.812zM22.54 0H1.46v2.836h21.08z" />,
  linkedin: (color) => <SvcIcon color={color} d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />,
  threads: (color) => <SvcIcon color={color} d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.265 1.33-3.084.857-.762 2.058-1.2 3.479-1.269 1.015-.05 1.96.026 2.836.194-.07-.81-.281-1.452-.635-1.924-.506-.672-1.281-1.018-2.303-1.028h-.06c-.774.005-1.758.264-2.353.754l-1.354-1.594C6.908 4.353 8.417 3.9 9.878 3.882h.088c1.595.017 2.856.598 3.742 1.724.783.996 1.208 2.322 1.263 3.94.544.127 1.05.296 1.514.506 1.14.516 2.084 1.29 2.728 2.238.88 1.296 1.07 2.878.547 4.574-.7 2.268-2.593 3.823-5.635 4.626-.892.236-1.883.378-2.967.442-.32.019-.643.03-.968.03l.004.038zM10.14 15.39c.017.305.17.6.43.827.37.318.9.482 1.437.453.907-.05 1.6-.36 2.06-.925.31-.382.555-.906.731-1.562-.66-.14-1.37-.2-2.108-.168-.97.046-1.683.313-2.12.793-.278.306-.419.65-.43.582z" />,
  youtube: (color) => <SvcIcon color={color} d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z" />,
};

// ── Service connection definitions ──────────────────────────────────────────
// Add new services here. Each entry drives a connect/disconnect card in Settings.
// In Electron, services with `electronAuth: true` use native browser login
// flows via IPC. In web mode, they fall back to manual token paste.
const SERVICES = [
  {
    id: "twitter",
    name: "X / Twitter",
    settingsKey: "twitterSession",
    envKey: "TWITTER_SESSION",
    description: "Access tweets and threads from tracked X accounts.",
    electronAuth: true,
    manualPlaceholder: "Paste auth_token cookie value...",
    manualHelpText: "In your browser: log in to x.com, then open DevTools (F12) > Application > Cookies > x.com and copy the 'auth_token' value.",
  },
  {
    id: "substack",
    name: "Substack",
    settingsKey: "substackSession",
    envKey: "SUBSTACK_SESSION",
    description: "Access paywalled Substack posts you subscribe to.",
    electronAuth: true,
    manualPlaceholder: "Paste substack.sid cookie value...",
    manualHelpText: "In your browser: log in to Substack, then open DevTools (F12) > Application > Cookies > substack.com and copy the 'substack.sid' value.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    settingsKey: "linkedinSession",
    envKey: "LINKEDIN_SESSION",
    description: "Monitor posts from LinkedIn thought leaders.",
    electronAuth: true,
    manualPlaceholder: "Paste li_at cookie value...",
    manualHelpText: "In your browser: log in to LinkedIn, then open DevTools (F12) > Application > Cookies > linkedin.com and copy the 'li_at' value.",
  },
  {
    id: "threads",
    name: "Threads",
    settingsKey: "threadsSession",
    envKey: "THREADS_SESSION",
    description: "Follow conversations on Threads by Meta.",
    electronAuth: true,
    manualPlaceholder: "Paste sessionid cookie value...",
    manualHelpText: "In your browser: log in to threads.net, then open DevTools (F12) > Application > Cookies > threads.net and copy the 'sessionid' value.",
  },
  {
    id: "youtube",
    name: "YouTube",
    settingsKey: "youtubeSession",
    envKey: "YOUTUBE_SESSION",
    description: "Access subscriptions and channel content on YouTube.",
    electronAuth: true,
    manualPlaceholder: "Paste SID cookie value...",
    manualHelpText: "In your browser: log in to YouTube, then open DevTools (F12) > Application > Cookies > youtube.com and copy the 'SID' value.",
  },
];

const isElectron = !!(window.electronAPI?.isElectron);

// ── Service Connect Card ────────────────────────────────────────────────────
function ServiceCard({ service, connected, maskedToken, onConnect, onDisconnect }) {
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const useNativeAuth = isElectron && service.electronAuth;

  const handleNativeConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await window.electronAPI.connectService(service.id);
      if (result.ok) {
        onConnect(service, null); // token already saved by Electron
      } else {
        setError(result.error || "Connection failed");
      }
    } catch (e) {
      setError(e.message);
    }
    setConnecting(false);
  };

  const handleManualSave = () => {
    if (token.trim()) {
      onConnect(service, token.trim());
      setToken("");
      setShowManual(false);
    }
  };

  return (
    <div style={{ padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: connected ? "var(--accent-bg)" : "var(--bg-input)", border: `1px solid ${connected ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {SERVICE_ICONS[service.id]?.(connected ? "var(--accent)" : "var(--text-disabled)")}
          </div>
          <div>
            <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500, fontFamily: sans }}>{service.name}</div>
            <div style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: sans }}>{service.description}</div>
          </div>
        </div>
        {connected ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#10B981", fontSize: 10, fontFamily: mono }}>Connected</span>
            <button onClick={() => onDisconnect(service)} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 10, fontFamily: mono, cursor: "pointer" }}>Disconnect</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {useNativeAuth ? (
              <button onClick={handleNativeConnect} disabled={connecting} style={{ padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600, opacity: connecting ? 0.6 : 1 }}>
                {connecting ? "Connecting..." : `Sign in to ${service.name}`}
              </button>
            ) : (
              <button onClick={() => setShowManual(!showManual)} style={{ padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>
                Connect
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--error-bg)", borderRadius: 5, color: "#EF4444", fontSize: 11, fontFamily: mono }}>
          {error}
        </div>
      )}

      {/* Manual token entry (web mode, or as fallback) */}
      {!connected && (showManual || (useNativeAuth && error)) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
            {useNativeAuth && error ? "Sign-in didn't work? You can paste the token manually:" : service.manualHelpText}
            {service.manualHelpUrl && <> <a href={service.manualHelpUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Open portal →</a></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={service.manualPlaceholder}
              style={{ padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, fontFamily: mono, outline: "none", flex: 1 }}
              onKeyDown={e => e.key === "Enter" && handleManualSave()} />
            <button onClick={handleManualSave} disabled={!token.trim()} style={{ padding: "7px 14px", background: token.trim() ? "var(--accent)" : "var(--bg-input)", border: `1px solid ${token.trim() ? "var(--accent)" : "var(--border)"}`, borderRadius: 6, color: token.trim() ? "white" : "var(--text-disabled)", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s);
      setForm({
        apiKey: "",
        relevanceContext: s.relevanceContext || "",
        scoringInstructions: s.scoringInstructions || "",
        refreshInterval: s.refreshInterval || "30",
      });
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const updates = {};
    if (form.apiKey) updates.ANTHROPIC_API_KEY = form.apiKey;
    if (form.relevanceContext !== (settings?.relevanceContext || "")) updates.RELEVANCE_CONTEXT = form.relevanceContext;
    if (form.scoringInstructions !== (settings?.scoringInstructions || "")) updates.SCORING_INSTRUCTIONS = form.scoringInstructions;
    if (form.refreshInterval !== (settings?.refreshInterval || "30")) updates.FEED_REFRESH_INTERVAL = form.refreshInterval;

    if (Object.keys(updates).length > 0) {
      try { await api.saveSettings(updates); } catch (e) { console.error(e); }
    }
    setSaving(false);
    onClose();
  };

  const handleServiceConnect = async (service, token) => {
    try {
      // If token is null, Electron already saved it via IPC — just refresh settings
      if (token) await api.saveSettings({ [service.envKey]: token });
      const refreshed = await api.getSettings();
      setSettings(refreshed);
    } catch (e) { console.error(e); }
  };

  const handleServiceDisconnect = async (service) => {
    try {
      await api.saveSettings({ [service.envKey]: "" });
      const refreshed = await api.getSettings();
      setSettings(refreshed);
    } catch (e) { console.error(e); }
  };

  const inp = { padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 13, fontFamily: sans, outline: "none", width: "100%" };
  const textarea = { ...inp, minHeight: 80, resize: "vertical", fontFamily: sans, lineHeight: 1.5 };
  const label = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };
  const hint = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };

  if (!settings) return null;

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: `-8px 0 32px var(--shadow-panel)` }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-primary)", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>⚙ SETTINGS</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Your Role */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>Your Role</div>
          <label style={label}>RELEVANCE CONTEXT</label>
          <textarea value={form.relevanceContext} onChange={e => setForm(f => ({ ...f, relevanceContext: e.target.value }))} placeholder="Describe your role, responsibilities, and focus areas..." style={textarea} />
          <div style={hint}>This tells the LLM who you are so it can score items for your specific needs. Be specific about your role, industry, and focus areas.</div>
        </div>

        {/* Scoring Instructions */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>Scoring Instructions</div>
          <label style={label}>PRIORITIZATION & FILTERING</label>
          <textarea value={form.scoringInstructions} onChange={e => setForm(f => ({ ...f, scoringInstructions: e.target.value }))} placeholder="E.g., Prioritize agentic AI and MCP protocol developments. Deprioritize general ML benchmarks. Flag anything related to EU AI Act..." style={textarea} />
          <div style={hint}>Additional instructions for how items should be scored, filtered, or recommended. These are appended to the scoring prompt.</div>
        </div>

        {/* API Key */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>API Keys</div>
          <label style={label}>ANTHROPIC API KEY {settings.hasApiKey && <span style={{ color: "#10B981" }}>(configured)</span>}</label>
          <input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} placeholder={settings.hasApiKey ? settings.anthropicApiKey : "sk-ant-..."} style={inp} />
          <div style={hint}>Required for relevance scoring and analysis. Leave blank to keep current key.</div>
        </div>

        {/* Refresh Interval */}
        <div>
          <label style={label}>FEED REFRESH INTERVAL (MINUTES)</label>
          <input type="number" min="5" max="1440" value={form.refreshInterval} onChange={e => setForm(f => ({ ...f, refreshInterval: e.target.value }))} style={{ ...inp, width: 120 }} />
        </div>

        {/* Connected Services */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 6 }}>Connected Services</div>
          <div style={hint}>Connect to third-party services for authenticated feed access.</div>
          <div style={{ marginTop: 10 }}>
            {SERVICES.map(svc => (
              <ServiceCard
                key={svc.id}
                service={svc}
                connected={!!settings[svc.settingsKey]}
                maskedToken={settings[svc.settingsKey]}
                onConnect={handleServiceConnect}
                onDisconnect={handleServiceDisconnect}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontFamily: mono, fontSize: 12, cursor: "pointer", fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onClose} style={{ padding: "8px 20px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Saved Items Panel ───────────────────────────────────────────────────────
function SavedItemsPanel({ onClose }) {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const loadSaved = useCallback(async () => {
    try {
      const res = await api.getItems({ saved: true, limit: 500, category: category !== "all" ? category : undefined });
      setItems(res.items);
    } catch (e) { console.error(e); }
  }, [category]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const handleUnsave = async (item) => {
    await api.toggleSave(item.id, false);
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleDelete = async (item) => {
    await api.deleteItem(item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setConfirmDeleteId(null);
  };

  const catCounts = {};
  for (const it of items) { catCounts[it.category] = (catCounts[it.category] || 0) + 1; }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: `-8px 0 32px var(--shadow-panel)` }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-primary)", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>★ SAVED ITEMS ({items.length})</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      {/* Category filter */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{ key: "all", label: `All (${items.length})` },
          ...Object.entries(CATEGORIES).filter(([k]) => catCounts[k]).map(([k, v]) => ({ key: k, label: `${v.icon} ${catCounts[k]}` }))
        ].map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)} style={{
            padding: "4px 10px", borderRadius: 6, border: "1px solid", fontSize: 10, fontFamily: mono, cursor: "pointer",
            borderColor: category === c.key ? "var(--accent)" : "var(--border)",
            background: category === c.key ? "var(--accent-bg)" : "transparent",
            color: category === c.key ? "var(--accent)" : "var(--text-muted)",
          }}>{c.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-faint)" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>★</div>
            <div style={{ fontSize: 13, fontFamily: sans }}>No saved items yet. Click the star on any item to save it here.</div>
          </div>
        )}
        {items.filter(i => category === "all" || i.category === category).map(item => {
          const cat = CATEGORIES[item.category] || { color: "#6B7280", label: item.category };
          const isConfirming = confirmDeleteId === item.id;
          return (
            <div key={item.id} style={{ padding: "12px 14px", marginBottom: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderLeft: `3px solid ${relColor(item.relevance)}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: cat.color + "15", color: cat.color, fontFamily: mono, fontWeight: 600 }}>{cat.label}</span>
                <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: relColor(item.relevance) + "15", color: relColor(item.relevance), fontFamily: mono, fontWeight: 600 }}>{(item.relevance * 100).toFixed(0)}%</span>
                <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>{timeAgo(item.published)}</span>
              </div>
              <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
              {item.relevance_reason && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{item.relevance_reason}</div>
              )}
              {isConfirming ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: sans }}>Delete permanently?</span>
                  <button onClick={() => handleDelete(item)} style={{ padding: "4px 12px", background: "#EF4444", border: "none", borderRadius: 5, color: "white", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                  <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "4px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 10, fontFamily: mono, cursor: "pointer" }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 10px", background: "var(--accent)", borderRadius: 5, color: "white", fontSize: 10, fontFamily: mono, textDecoration: "none" }}>Open →</a>}
                  <button onClick={() => handleUnsave(item)} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 10, fontFamily: mono, cursor: "pointer" }}>Unsave</button>
                  <button onClick={() => setConfirmDeleteId(item.id)} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "#EF4444", fontSize: 10, fontFamily: mono, cursor: "pointer" }}>Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [items, setItems] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [stats, setStats] = useState({});
  const [category, setCategory] = useState("all");
  const [minRelevance, setMinRelevance] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, feedsRes, statsRes] = await Promise.all([
        api.getItems({ category: category !== "all" ? category : undefined, minRelevance, search, unread: true, limit: 100 }),
        api.getFeeds(),
        api.getStats(),
      ]);
      setItems(itemsRes.items);
      setFeeds(feedsRes);
      setStats(statsRes);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    setLoading(false);
  }, [category, minRelevance, search]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Listen for Electron's Cmd+, settings shortcut
  useEffect(() => {
    const handler = () => { setShowSettings(true); setShowAnalysis(false); setShowSources(false); };
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshAll();
      await api.scoreItems();
      await loadData();
    } catch (e) { console.error(e); }
    setRefreshing(false);
  };

  const handleItemClick = async (item) => {
    if (expandedItem === item.id) {
      setExpandedItem(null);
    } else {
      setExpandedItem(item.id);
      if (!item.read) {
        try { await api.markRead(item.id); } catch (e) { /* ok */ }
      }
    }
  };

  const handleSave = async (e, item) => {
    e.stopPropagation();
    try {
      await api.toggleSave(item.id, !item.saved);
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleDismiss = async (e, item) => {
    e.stopPropagation();
    try {
      await api.dismissItem(item.id);
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleFeedback = async (e, item, value) => {
    e.stopPropagation();
    const newValue = item.feedback === value ? null : value; // toggle
    try {
      await api.feedbackItem(item.id, newValue);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, feedback: newValue } : i));
    } catch (err) { console.error(err); }
  };

  const handleMarkRead = async (e, item) => {
    e.stopPropagation();
    try {
      await api.markRead(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) { console.error(err); }
  };

  const openPanel = (panel) => {
    setShowAnalysis(panel === "analysis" ? !showAnalysis : false);
    setShowSources(panel === "sources" ? !showSources : false);
    setShowSettings(panel === "settings" ? !showSettings : false);
    setShowSaved(panel === "saved" ? !showSaved : false);
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "var(--bg-base)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #4F8EF7, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontFamily: mono, color: "white", fontWeight: 700 }}>Δ</div>
        <div style={{ color: "var(--text-muted)", fontFamily: mono, fontSize: 13 }}>Loading feeds...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      {/* Header */}
      <header style={{ padding: "12px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 50, background: "var(--bg-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #4F8EF7, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontFamily: mono, color: "white", fontWeight: 700 }}>Δ</div>
          <div>
            <div style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600, fontFamily: mono, letterSpacing: "-0.02em" }}>AI INTELLIGENCE HUB</div>
            <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>
              {feeds.filter(f => f.active).length} feeds · {stats.unread || 0} unread · {stats.critical || 0} critical
              {lastRefresh && ` · refreshed ${timeAgo(lastRefresh.toISOString())}`}
            </div>
          </div>
        </div>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "7px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, flex: 1, minWidth: 120, fontFamily: sans, outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {[
            { label: "🧠 Intel", panel: "analysis", active: showAnalysis },
            { label: "★ Saved", panel: "saved", active: showSaved },
            { label: "📡 Sources", panel: "sources", active: showSources },
            { label: "⚙ Settings", panel: "settings", active: showSettings },
          ].map((b, i) => (
            <button key={i} onClick={() => openPanel(b.panel)} style={{ padding: "7px 12px", background: b.active ? "var(--accent-bg)" : "var(--bg-input)", border: `1px solid ${b.active ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, color: b.active ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontFamily: mono, whiteSpace: "nowrap" }}>{b.label}</button>
          ))}
          <button onClick={handleRefresh} disabled={refreshing} title="Refresh all feeds and score new items"
            style={{ padding: "7px 12px", background: refreshing ? "var(--accent-bg)" : "var(--bg-input)", border: `1px solid ${refreshing ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, color: refreshing ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontFamily: mono }}>
            {refreshing ? "⟳" : "🔄"}
          </button>
        </div>
      </header>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <aside style={{ width: 210, borderRight: "1px solid var(--border)", padding: "18px 14px", position: "sticky", top: 52, height: "calc(100vh - 52px)", overflow: "auto", flexShrink: 0 }}>
          <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>CATEGORIES</div>

          {[{ key: "all", label: `All Items (${stats.totalItems || 0})`, color: "var(--text-secondary)" },
            ...Object.entries(CATEGORIES).map(([k, v]) => ({
              key: k, label: `${v.icon} ${v.label}`, color: v.color,
              count: (stats.byCategory || []).find(c => c.category === k)?.count || 0,
            }))
          ].map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left",
              padding: "7px 10px", background: category === c.key ? "var(--accent-bg)" : "transparent",
              border: "none", borderRadius: 6, color: category === c.key ? c.color : "var(--text-secondary)",
              cursor: "pointer", fontSize: 12, fontFamily: sans, marginBottom: 2,
            }}>
              <span>{c.label}</span>
              {c.count !== undefined && <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: mono }}>{c.count}</span>}
            </button>
          ))}

          <div style={{ marginTop: 20, color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>RELEVANCE</div>
          <div style={{ padding: "0 8px" }}>
            <input type="range" min="0" max="0.9" step="0.05" value={minRelevance} onChange={e => setMinRelevance(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
            <div style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: mono, textAlign: "center" }}>≥ {(minRelevance * 100).toFixed(0)}%</div>
          </div>

          <div style={{ marginTop: 20, color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>THEME</div>
          <ThemeToggle mode={themeMode} setMode={setThemeMode} />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "20px 28px", maxWidth: 880 }}>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: mono, fontWeight: 500 }}>
              {category === "all" ? "ALL FEEDS" : CATEGORIES[category]?.label.toUpperCase()}
              <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>({items.length})</span>
            </span>
          </div>

          {items.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-faint)" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⌕</div>
              <div style={{ fontSize: 13, fontFamily: sans }}>No items match your filters. Try lowering the relevance threshold or broadening the category.</div>
            </div>
          )}

          {items.map((item, idx) => {
            const isExpanded = expandedItem === item.id;
            const cat = CATEGORIES[item.category] || { color: "#6B7280", label: item.category, icon: "📄" };

            return (
              <div key={item.id} onClick={() => handleItemClick(item)} style={{
                padding: "14px 18px", marginBottom: 6,
                background: isExpanded ? "var(--bg-elevated)" : item.read ? "var(--item-read)" : "var(--item-unread)",
                border: `1px solid ${item.relevance >= 0.85 ? relColor(item.relevance) + "40" : "var(--border)"}`,
                borderLeft: `3px solid ${relColor(item.relevance)}`,
                borderRadius: 8, cursor: "pointer",
                opacity: item.read && !isExpanded ? 0.65 : 1,
                transition: "all 0.15s",
                animation: `slideIn 0.25s ease ${idx * 0.02}s both`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: cat.color + "15", color: cat.color, fontFamily: mono, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: relColor(item.relevance) + "15", color: relColor(item.relevance), fontFamily: mono, fontWeight: 600 }}>{(item.relevance * 100).toFixed(0)}%</span>
                  <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>{item.feed_id} · {timeAgo(item.published)}</span>
                  {item.saved ? <span style={{ fontSize: 10 }}>★</span> : null}
                  {item.feedback === 1 && <span style={{ fontSize: 10 }}>👍</span>}
                  {item.feedback === -1 && <span style={{ fontSize: 10 }}>👎</span>}
                </div>
                <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                <div style={{
                  color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.6,
                  display: isExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: isExpanded ? "unset" : 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{item.summary}</div>

                {isExpanded && (
                  <div style={{ marginTop: 10 }}>
                    {item.relevance_reason && (
                      <div style={{ padding: "8px 12px", background: "var(--accent-bg-subtle)", border: "1px solid var(--accent-border)", borderRadius: 6, marginBottom: 8 }}>
                        <div style={{ color: "var(--accent)", fontSize: 10, fontFamily: mono, marginBottom: 3, fontWeight: 600 }}>WHY THIS MATTERS</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>{item.relevance_reason}</div>
                      </div>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {item.tags.map(t => <span key={t} style={{ padding: "2px 8px", background: "var(--tag-bg)", borderRadius: 10, color: "var(--text-muted)", fontSize: 10, fontFamily: mono }}>#{t}</span>)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: "5px 12px", background: "var(--accent)", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, textDecoration: "none" }}>Open →</a>}
                      <button onClick={e => handleFeedback(e, item, 1)} title="More like this" style={{ padding: "5px 10px", background: item.feedback === 1 ? "rgba(16,185,129,0.15)" : "transparent", border: `1px solid ${item.feedback === 1 ? "#10B981" : "var(--border)"}`, borderRadius: 6, color: item.feedback === 1 ? "#10B981" : "var(--text-faint)", cursor: "pointer", fontSize: 13 }}>
                        👍
                      </button>
                      <button onClick={e => handleFeedback(e, item, -1)} title="Less like this" style={{ padding: "5px 10px", background: item.feedback === -1 ? "rgba(239,68,68,0.15)" : "transparent", border: `1px solid ${item.feedback === -1 ? "#EF4444" : "var(--border)"}`, borderRadius: 6, color: item.feedback === -1 ? "#EF4444" : "var(--text-faint)", cursor: "pointer", fontSize: 13 }}>
                        👎
                      </button>
                      <button onClick={e => handleSave(e, item)} style={{ padding: "5px 12px", background: item.saved ? "var(--accent-bg)" : "transparent", border: `1px solid ${item.saved ? "var(--accent)" : "var(--border)"}`, borderRadius: 6, color: item.saved ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
                        {item.saved ? "★ Saved" : "☆ Save"}
                      </button>
                      <button onClick={e => handleMarkRead(e, item)} title="Mark read and remove from feed" style={{ padding: "5px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
                        ✓ Read
                      </button>
                      <button onClick={e => handleDismiss(e, item)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-faint)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
                        ✕ Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>

      {/* Panels */}
      {showAnalysis && <AnalysisPanel category={category} onClose={() => setShowAnalysis(false)} />}
      {showSources && <SourcesPanel feeds={feeds} onClose={() => setShowSources(false)} onRefresh={loadData} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showSaved && <SavedItemsPanel onClose={() => setShowSaved(false)} />}
    </div>
  );
}
