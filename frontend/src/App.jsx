import { useState, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import { api } from "./api.js";

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

// ── Analysis Panel ──────────────────────────────────────────────────────────
function AnalysisPanel({ category, onClose }) {
  const [mode, setMode] = useState("briefing");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult("");
    try {
      const data = await api.analyze(mode, category !== "all" ? category : null);
      setResult(data.result);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [mode, category]);

  useEffect(() => { run(); }, [run]);

  const modes = [
    { key: "briefing", label: "Executive Brief" },
    { key: "risks", label: "Risk Scan" },
    { key: "gaps", label: "Coverage Gaps" },
    { key: "what-so-what-now-what", label: "What / So What / Now What" },
  ];

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "#0D1117", borderLeft: "1px solid #1E2A3A", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.6)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#E6EDF3", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>🧠 LLM ANALYSIS</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {modes.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            padding: "5px 12px", borderRadius: 6, border: "1px solid", fontSize: 11, fontFamily: mono,
            borderColor: mode === m.key ? "#4F8EF7" : "#1E2A3A", cursor: "pointer",
            background: mode === m.key ? "rgba(79,142,247,0.12)" : "transparent",
            color: mode === m.key ? "#4F8EF7" : "#8B949E",
          }}>{m.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {loading && <div style={{ color: "#8B949E", fontFamily: mono, fontSize: 13 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4F8EF7", animation: "pulse 1.5s infinite", marginRight: 8 }} />Analyzing...</div>}
        {error && <div style={{ color: "#EF4444", fontFamily: mono, fontSize: 13 }}>⚠ {error}</div>}
        {result && <div className="analysis-markdown" style={{ color: "#C9D1D9", fontSize: 13.5, lineHeight: 1.75, fontFamily: sans }}><Markdown components={{
          h1: ({ children }) => <h1 style={{ color: "#E6EDF3", fontSize: 18, fontWeight: 600, fontFamily: mono, marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #1E2A3A" }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ color: "#E6EDF3", fontSize: 15, fontWeight: 600, fontFamily: mono, marginTop: 18, marginBottom: 8 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ color: "#C9D1D9", fontSize: 13.5, fontWeight: 600, fontFamily: mono, marginTop: 14, marginBottom: 6 }}>{children}</h3>,
          p: ({ children }) => <p style={{ marginTop: 0, marginBottom: 10 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: "#E6EDF3", fontWeight: 600 }}>{children}</strong>,
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, color: "#C9D1D9" }}>{children}</li>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid #1E2A3A", margin: "14px 0" }} />,
          code: ({ children, inline }) => inline !== false
            ? <code style={{ background: "#161B22", padding: "2px 6px", borderRadius: 4, fontSize: 12, fontFamily: mono, color: "#4F8EF7" }}>{children}</code>
            : <pre style={{ background: "#161B22", padding: 12, borderRadius: 6, overflow: "auto", fontSize: 12, fontFamily: mono, color: "#C9D1D9", margin: "8px 0" }}><code>{children}</code></pre>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: "3px solid #4F8EF7", paddingLeft: 14, margin: "10px 0", color: "#8B949E" }}>{children}</blockquote>,
        }}>{result}</Markdown></div>}
      </div>
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
  const [newFeed, setNewFeed] = useState({ name: "", url: "", type: "rss", category: "research" });
  const [expandedFeed, setExpandedFeed] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showRecs, setShowRecs] = useState(true);

  // Load feed health on mount; auto-generate recommendations
  useEffect(() => {
    api.getFeedHealth().then(setHealthData).catch(() => {});
    // Auto-generate fresh recommendations on panel open
    runHealthCheck();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runHealthCheck = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await api.analyzeFeedHealth();
      setAnalysis(result);
      const sug = await api.getSuggestions();
      setSuggestions(sug);
    } catch (e) { console.error(e); }
    setAnalyzing(false);
  };

  const refreshHealth = () => api.getFeedHealth().then(setHealthData).catch(() => {});

  const toggleMute = async (feed) => {
    await api.updateFeed(feed.id, { active: feed.active ? 0 : 1 });
    onRefresh();
    refreshHealth();
  };

  const removeFeed = async (feed) => {
    await api.deleteFeed(feed.id);
    setConfirmDelete(null);
    setExpandedFeed(null);
    onRefresh();
    refreshHealth();
  };

  const acceptSuggestion = async (s) => {
    try {
      await api.acceptSuggestion(s.id);
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
      onRefresh();
      refreshHealth();
      api.getSuggestions().then(setSuggestions).catch(() => {});
    } catch (e) { console.error(e); }
  };

  const dismissSuggestion = async (s) => {
    try {
      await api.dismissSuggestion(s.id);
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
    } catch (e) { console.error(e); }
  };

  const addFeed = async () => {
    if (!newFeed.name || !newFeed.url) return;
    await api.addFeed({ ...newFeed, id: `custom-${Date.now()}`, active: 1 });
    setNewFeed({ name: "", url: "", type: "rss", category: "research" });
    setShowAddForm(false);
    onRefresh();
  };

  const enriched = (healthData || feeds).filter(f => f.type !== "x-account");
  const activeCount = enriched.filter(f => f.active).length;
  const mutedCount = enriched.filter(f => !f.active).length;
  const hasSuggestions = suggestions.length > 0;

  const inp = { padding: "8px 12px", background: "#161B22", border: "1px solid #1E2A3A", borderRadius: 6, color: "#E6EDF3", fontSize: 13, fontFamily: sans, outline: "none", width: "100%" };

  const staleIds = new Set((analysis?.stale || []).map(s => s.id));
  const noisyIds = new Set((analysis?.noisy || []).map(s => s.id));
  const staleMap = Object.fromEntries((analysis?.stale || []).map(s => [s.id, s.reason]));
  const noisyMap = Object.fromEntries((analysis?.noisy || []).map(s => [s.id, s.reason]));

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "#0D1117", borderLeft: "1px solid #1E2A3A", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.6)" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#E6EDF3", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>📡 SOURCES</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      {/* Summary bar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#8B949E", fontSize: 12, fontFamily: mono }}>
          Active: <span style={{ color: "#10B981" }}>{activeCount}</span>
          {mutedCount > 0 && <> · Muted: <span style={{ color: "#6B7280" }}>{mutedCount}</span></>}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #1E2A3A", background: showAddForm ? "rgba(79,142,247,0.12)" : "transparent", color: showAddForm ? "#4F8EF7" : "#8B949E", cursor: "pointer", fontSize: 11, fontFamily: mono }}>+ Add Feed</button>
          <button onClick={runHealthCheck} disabled={analyzing} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #1E2A3A", background: "transparent", color: "#8B949E", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
            {analyzing ? "Checking..." : "Health Check"}
          </button>
        </div>
      </div>

      {/* Add feed form */}
      {showAddForm && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E2A3A", background: "#0A0E14" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="Feed name" value={newFeed.name} onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))} style={inp} />
            <input placeholder="URL" value={newFeed.url} onChange={e => setNewFeed(p => ({ ...p, url: e.target.value }))} style={inp} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={newFeed.type} onChange={e => setNewFeed(p => ({ ...p, type: e.target.value }))} style={{ ...inp, flex: 1 }}>
                <option value="rss">RSS</option><option value="x-account">X Account</option><option value="scrape">Web Scrape</option>
              </select>
              <select value={newFeed.category} onChange={e => setNewFeed(p => ({ ...p, category: e.target.value }))} style={{ ...inp, flex: 1 }}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button onClick={addFeed} style={{ padding: 10, background: "#4F8EF7", border: "none", borderRadius: 6, color: "white", fontFamily: mono, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Add Feed</button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1E2A3A", background: "rgba(239,68,68,0.06)" }}>
          <div style={{ color: "#E6EDF3", fontSize: 12, fontFamily: sans, marginBottom: 8 }}>
            Delete <strong>{confirmDelete.name}</strong>? This will remove the feed and all its items.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => removeFeed(confirmDelete)} style={{ padding: "6px 14px", background: "#EF4444", border: "none", borderRadius: 5, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Delete</button>
            <button onClick={() => setConfirmDelete(null)} style={{ padding: "6px 14px", background: "transparent", border: "1px solid #1E2A3A", borderRadius: 5, color: "#8B949E", fontSize: 11, fontFamily: mono, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {Object.entries(CATEGORIES).map(([ck, cat]) => {
          const catFeeds = enriched.filter(f => f.category === ck);
          const catSuggestions = suggestions.filter(s => s.category === ck).slice(0, 3);
          if (!catFeeds.length && !catSuggestions.length) return null;
          const active = catFeeds.filter(f => f.active);
          const muted = catFeeds.filter(f => !f.active);
          const sorted = [...active, ...muted];

          return (
            <div key={ck} style={{ padding: "12px 20px", borderBottom: "1px solid #1E2A3A" }}>
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
                    <div onClick={() => setExpandedFeed(isExpanded ? null : f.id)} style={{ padding: "8px 10px", marginBottom: 2, borderRadius: 6, background: isExpanded ? "#161B22" : !f.active ? "rgba(107,114,128,0.06)" : status === "error" ? "rgba(239,68,68,0.04)" : "transparent", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: 8 }}>
                          <span title={dotTitle} style={{ width: 7, height: 7, borderRadius: "50%", background: f.active ? dotColor : "#4B5563", flexShrink: 0 }} />
                          <span style={{ color: f.active ? "#C9D1D9" : "#6B7280", fontSize: 12.5, fontFamily: sans, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <span style={{ color: "#6B7280", fontSize: 10, fontFamily: mono, flexShrink: 0 }}>{f.type}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {!f.active && <span style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, marginRight: 2 }}>MUTED</span>}
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
                          <span style={{ color: "#6B7280", fontSize: 10, fontFamily: mono }}>Items: {f.live_items ?? f.item_count ?? 0}</span>
                          {f.last_error && <span style={{ color: "#EF4444", fontSize: 10, fontFamily: mono }} title={f.last_error}>⚠ {f.last_error.slice(0, 30)}</span>}
                        </div>
                      )}
                      {isStale && <div style={{ color: "#F59E0B", fontSize: 10, fontFamily: mono, marginTop: 3, paddingLeft: 15 }}>⚠ Stale: {staleMap[f.id]}</div>}
                      {isNoisy && <div style={{ color: "#F97316", fontSize: 10, fontFamily: mono, marginTop: 3, paddingLeft: 15 }}>⚠ Noisy: {noisyMap[f.id]}</div>}
                    </div>
                    {/* Expanded feed detail */}
                    {isExpanded && (
                      <div style={{ padding: "10px 14px 12px 25px", marginBottom: 4, background: "#161B22", borderRadius: "0 0 6px 6px", borderTop: "1px solid #1E2A3A" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div>
                            <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>URL</div>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "#4F8EF7", fontSize: 11, fontFamily: mono, wordBreak: "break-all", textDecoration: "none" }}>{f.url}</a>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>RELEVANCE</div>
                              <span style={{ color: relColor(avgRel), fontSize: 12, fontFamily: mono, fontWeight: 600 }}>{(avgRel * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>HEALTH</div>
                              <span style={{ color: dotColor, fontSize: 12, fontFamily: mono, fontWeight: 600 }}>{dotTitle}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>CADENCE</div>
                              <span style={{ color: "#C9D1D9", fontSize: 11, fontFamily: mono }}>
                                {f.avg_interval_hours != null
                                  ? f.avg_interval_hours < 24 ? "~daily" : f.avg_interval_hours < 72 ? "~every few days" : f.avg_interval_hours < 168 ? "~weekly" : `~every ${Math.round(f.avg_interval_hours / 24)}d`
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>ITEMS</div>
                              <span style={{ color: "#C9D1D9", fontSize: 11, fontFamily: mono }}>{f.live_items ?? f.item_count ?? 0}</span>
                            </div>
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>CATEGORY</div>
                              <span style={{ color: cat.color, fontSize: 11, fontFamily: mono }}>{cat.label}</span>
                            </div>
                          </div>
                          {f.last_error && (
                            <div>
                              <div style={{ color: "#6B7280", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 2 }}>ERROR</div>
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
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #1E2A3A" }}>
                  <div style={{ color: "#4F8EF7", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 6, letterSpacing: "0.05em" }}>SUGGESTED</div>
                  {catSuggestions.map(s => (
                    <div key={s.id} style={{ padding: "6px 10px", marginBottom: 4, background: "rgba(79,142,247,0.04)", border: "1px solid rgba(79,142,247,0.1)", borderRadius: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: "#C9D1D9", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>{s.name}</span>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => acceptSuggestion(s)} style={{ padding: "2px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Add</button>
                          <button onClick={() => dismissSuggestion(s)} style={{ padding: "2px 8px", background: "transparent", border: "1px solid #1E2A3A", borderRadius: 3, color: "#6B7280", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
                        </div>
                      </div>
                      {s.reason && <div style={{ color: "#8B949E", fontSize: 10, lineHeight: 1.4 }}>{s.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Uncategorized suggestions */}
        {showRecs && suggestions.filter(s => !CATEGORIES[s.category]).length > 0 && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #1E2A3A" }}>
            <div style={{ color: "#4F8EF7", fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 8 }}>SUGGESTED</div>
            {suggestions.filter(s => !CATEGORIES[s.category]).slice(0, 3).map(s => (
              <div key={s.id} style={{ padding: "6px 10px", marginBottom: 4, background: "rgba(79,142,247,0.04)", border: "1px solid rgba(79,142,247,0.1)", borderRadius: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "#C9D1D9", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>{s.name}</span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => acceptSuggestion(s)} style={{ padding: "2px 8px", background: "#10B981", border: "none", borderRadius: 3, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Add</button>
                    <button onClick={() => dismissSuggestion(s)} style={{ padding: "2px 8px", background: "transparent", border: "1px solid #1E2A3A", borderRadius: 3, color: "#6B7280", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
                {s.reason && <div style={{ color: "#8B949E", fontSize: 10, lineHeight: 1.4 }}>{s.reason}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Recommendations toggle / health check prompt */}
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {hasSuggestions && (
            <button onClick={() => setShowRecs(!showRecs)} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 10, fontFamily: mono, cursor: "pointer", padding: 0 }}>
              {showRecs ? "▾ Hide recommendations" : "▸ Show recommendations"}
            </button>
          )}
          {!hasSuggestions && !analysis && (
            <div style={{ color: "#6B7280", fontSize: 11, fontFamily: sans }}>
              Run a Health Check to get AI-powered feed recommendations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [items, setItems] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [stats, setStats] = useState({});
  const [category, setCategory] = useState("all");
  const [minRelevance, setMinRelevance] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, feedsRes, statsRes] = await Promise.all([
        api.getItems({ category: category !== "all" ? category : undefined, minRelevance, search, limit: 100 }),
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

  const openPanel = (panel) => {
    setShowAnalysis(panel === "analysis" ? !showAnalysis : false);
    setShowSources(panel === "sources" ? !showSources : false);
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #4F8EF7, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontFamily: mono, color: "white", fontWeight: 700 }}>Δ</div>
        <div style={{ color: "#8B949E", fontFamily: mono, fontSize: 13 }}>Loading feeds...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0E14" }}>
      {/* Header */}
      <header style={{ padding: "12px 28px", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, background: "#0D1117" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #4F8EF7, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontFamily: mono, color: "white", fontWeight: 700 }}>Δ</div>
          <div>
            <div style={{ color: "#E6EDF3", fontSize: 15, fontWeight: 600, fontFamily: mono, letterSpacing: "-0.02em" }}>AI INTELLIGENCE HUB</div>
            <div style={{ color: "#6B7280", fontSize: 10, fontFamily: mono }}>
              {feeds.filter(f => f.active).length} feeds · {stats.unread || 0} unread · {stats.critical || 0} critical
              {lastRefresh && ` · refreshed ${timeAgo(lastRefresh.toISOString())}`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "7px 14px", background: "#161B22", border: "1px solid #1E2A3A", borderRadius: 8, color: "#E6EDF3", fontSize: 13, width: 220, fontFamily: sans, outline: "none" }} />
          {[
            { label: "🧠 Analyze", panel: "analysis", active: showAnalysis },
            { label: "📡 Sources", panel: "sources", active: showSources },
          ].map((b, i) => (
            <button key={i} onClick={() => openPanel(b.panel)} style={{ padding: "7px 12px", background: b.active ? "rgba(79,142,247,0.12)" : "#161B22", border: `1px solid ${b.active ? "#4F8EF7" : "#1E2A3A"}`, borderRadius: 8, color: b.active ? "#4F8EF7" : "#C9D1D9", cursor: "pointer", fontSize: 13, fontFamily: mono, whiteSpace: "nowrap" }}>{b.label}</button>
          ))}
          <button onClick={handleRefresh} disabled={refreshing} title="Refresh all feeds and score new items"
            style={{ padding: "7px 12px", background: refreshing ? "rgba(79,142,247,0.12)" : "#161B22", border: `1px solid ${refreshing ? "#4F8EF7" : "#1E2A3A"}`, borderRadius: 8, color: refreshing ? "#4F8EF7" : "#C9D1D9", cursor: "pointer", fontSize: 13, fontFamily: mono }}>
            {refreshing ? "⟳" : "🔄"}
          </button>
        </div>
      </header>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <aside style={{ width: 210, borderRight: "1px solid #1E2A3A", padding: "18px 14px", position: "sticky", top: 52, height: "calc(100vh - 52px)", overflow: "auto", flexShrink: 0 }}>
          <div style={{ color: "#6B7280", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 10, fontWeight: 600 }}>CATEGORIES</div>

          {[{ key: "all", label: `All Items (${stats.totalItems || 0})`, color: "#C9D1D9" },
            ...Object.entries(CATEGORIES).map(([k, v]) => ({
              key: k, label: `${v.icon} ${v.label}`, color: v.color,
              count: (stats.byCategory || []).find(c => c.category === k)?.count || 0,
            }))
          ].map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left",
              padding: "7px 10px", background: category === c.key ? (c.color || "#4F8EF7") + "12" : "transparent",
              border: "none", borderRadius: 6, color: category === c.key ? c.color : "#C9D1D9",
              cursor: "pointer", fontSize: 12, fontFamily: sans, marginBottom: 2,
            }}>
              <span>{c.label}</span>
              {c.count !== undefined && <span style={{ fontSize: 10, color: "#6B7280", fontFamily: mono }}>{c.count}</span>}
            </button>
          ))}

          <div style={{ marginTop: 20, color: "#6B7280", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>RELEVANCE</div>
          <div style={{ padding: "0 8px" }}>
            <input type="range" min="0" max="0.9" step="0.05" value={minRelevance} onChange={e => setMinRelevance(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#4F8EF7" }} />
            <div style={{ color: "#8B949E", fontSize: 10, fontFamily: mono, textAlign: "center" }}>≥ {(minRelevance * 100).toFixed(0)}%</div>
          </div>

          <div style={{ marginTop: 20, color: "#6B7280", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>QUICK ACTIONS</div>
          <button onClick={() => { setCategory("all"); setMinRelevance(0.85); }} style={{ display: "block", width: "100%", padding: "6px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", cursor: "pointer", fontSize: 11, fontFamily: mono, marginBottom: 4, textAlign: "left" }}>
            🔴 Critical Only ({stats.critical || 0})
          </button>
          <button onClick={() => { setCategory("all"); setMinRelevance(0); setSearch(""); }} style={{ display: "block", width: "100%", padding: "6px 10px", background: "transparent", border: "1px solid #1E2A3A", borderRadius: 6, color: "#8B949E", cursor: "pointer", fontSize: 11, fontFamily: mono, textAlign: "left" }}>
            Reset Filters
          </button>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "20px 28px", maxWidth: 880 }}>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#E6EDF3", fontSize: 13, fontFamily: mono, fontWeight: 500 }}>
              {category === "all" ? "ALL FEEDS" : CATEGORIES[category]?.label.toUpperCase()}
              <span style={{ color: "#6B7280", marginLeft: 8 }}>({items.length})</span>
            </span>
          </div>

          {items.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#6B7280" }}>
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
                background: isExpanded ? "#161B22" : item.read ? "transparent" : "#0D1117",
                border: `1px solid ${item.relevance >= 0.85 ? relColor(item.relevance) + "40" : "#1E2A3A"}`,
                borderLeft: `3px solid ${relColor(item.relevance)}`,
                borderRadius: 8, cursor: "pointer",
                opacity: item.read && !isExpanded ? 0.65 : 1,
                transition: "all 0.15s",
                animation: `slideIn 0.25s ease ${idx * 0.02}s both`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: cat.color + "15", color: cat.color, fontFamily: mono, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: relColor(item.relevance) + "15", color: relColor(item.relevance), fontFamily: mono, fontWeight: 600 }}>{(item.relevance * 100).toFixed(0)}%</span>
                  <span style={{ color: "#6B7280", fontSize: 10, fontFamily: mono }}>{item.feed_id} · {timeAgo(item.published)}</span>
                  {item.saved ? <span style={{ fontSize: 10 }}>★</span> : null}
                </div>
                <div style={{ color: "#E6EDF3", fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                <div style={{
                  color: "#8B949E", fontSize: 12.5, lineHeight: 1.6,
                  display: isExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: isExpanded ? "unset" : 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{item.summary}</div>

                {isExpanded && (
                  <div style={{ marginTop: 10 }}>
                    {item.relevance_reason && (
                      <div style={{ padding: "8px 12px", background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", borderRadius: 6, marginBottom: 8 }}>
                        <div style={{ color: "#4F8EF7", fontSize: 10, fontFamily: mono, marginBottom: 3, fontWeight: 600 }}>WHY THIS MATTERS</div>
                        <div style={{ color: "#C9D1D9", fontSize: 12, lineHeight: 1.5 }}>{item.relevance_reason}</div>
                      </div>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {item.tags.map(t => <span key={t} style={{ padding: "2px 8px", background: "#1E2A3A", borderRadius: 10, color: "#8B949E", fontSize: 10, fontFamily: mono }}>#{t}</span>)}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: "5px 12px", background: "#4F8EF7", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, textDecoration: "none" }}>Open →</a>}
                      <button onClick={e => handleSave(e, item)} style={{ padding: "5px 12px", background: item.saved ? "rgba(79,142,247,0.12)" : "transparent", border: `1px solid ${item.saved ? "#4F8EF7" : "#1E2A3A"}`, borderRadius: 6, color: item.saved ? "#4F8EF7" : "#8B949E", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
                        {item.saved ? "★ Saved" : "☆ Save"}
                      </button>
                      <button onClick={e => handleDismiss(e, item)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #1E2A3A", borderRadius: 6, color: "#6B7280", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
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
    </div>
  );
}
