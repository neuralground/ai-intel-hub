import { useState, useEffect, useCallback } from "react";
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
  if (r >= 0.85) return "#EF4444";
  if (r >= 0.65) return "#F59E0B";
  if (r >= 0.4) return "#6B7280";
  return "#4B5563";
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
        {result && <div style={{ color: "#C9D1D9", fontSize: 13.5, lineHeight: 1.75, fontFamily: sans, whiteSpace: "pre-wrap" }}>{result}</div>}
      </div>
    </div>
  );
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ feeds, onClose, onRefresh }) {
  const [newFeed, setNewFeed] = useState({ name: "", url: "", type: "rss", category: "research" });
  const [refreshing, setRefreshing] = useState(false);
  const [scoring, setScoring] = useState(false);

  const addFeed = async () => {
    if (!newFeed.name || !newFeed.url) return;
    await api.addFeed({ ...newFeed, id: `custom-${Date.now()}`, active: 1 });
    setNewFeed({ name: "", url: "", type: "rss", category: "research" });
    onRefresh();
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try { await api.refreshAll(); onRefresh(); } catch (e) { console.error(e); }
    setRefreshing(false);
  };

  const doScore = async () => {
    setScoring(true);
    try { await api.scoreItems(); onRefresh(); } catch (e) { console.error(e); }
    setScoring(false);
  };

  const inp = { padding: "8px 12px", background: "#161B22", border: "1px solid #1E2A3A", borderRadius: 6, color: "#E6EDF3", fontSize: 13, fontFamily: sans, outline: "none", width: "100%" };

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 540, background: "#0D1117", borderLeft: "1px solid #1E2A3A", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.6)", overflow: "auto" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#E6EDF3", fontFamily: mono, fontSize: 14, fontWeight: 600 }}>⚙ SETTINGS</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      {/* Actions */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E2A3A", display: "flex", gap: 8 }}>
        <button onClick={doRefresh} disabled={refreshing} style={{ flex: 1, padding: "10px", background: "#161B22", border: "1px solid #1E2A3A", borderRadius: 6, color: "#E6EDF3", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>
          {refreshing ? "Fetching..." : "🔄 Refresh All Feeds"}
        </button>
        <button onClick={doScore} disabled={scoring} style={{ flex: 1, padding: "10px", background: "#161B22", border: "1px solid #1E2A3A", borderRadius: 6, color: "#E6EDF3", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>
          {scoring ? "Scoring..." : "🧠 Score Items"}
        </button>
      </div>

      {/* Add feed */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E2A3A" }}>
        <div style={{ color: "#8B949E", fontSize: 11, fontFamily: mono, marginBottom: 10, fontWeight: 600 }}>ADD NEW FEED</div>
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

      {/* Feed list */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ color: "#8B949E", fontSize: 11, fontFamily: mono, marginBottom: 10, fontWeight: 600 }}>FEEDS ({feeds.length})</div>
        {Object.entries(CATEGORIES).map(([ck, cat]) => {
          const cf = feeds.filter(f => f.category === ck);
          if (!cf.length) return null;
          return (
            <div key={ck} style={{ marginBottom: 14 }}>
              <div style={{ color: cat.color, fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 4 }}>{cat.icon} {cat.label.toUpperCase()}</div>
              {cf.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", borderRadius: 4 }}>
                  <span style={{ color: f.active ? "#C9D1D9" : "#6B7280", fontSize: 12, fontFamily: sans, textDecoration: f.active ? "none" : "line-through" }}>{f.name}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: "#6B7280", fontSize: 10, fontFamily: mono }}>{f.type}</span>
                    <button onClick={async () => { await api.updateFeed(f.id, { ...f, active: f.active ? 0 : 1 }); onRefresh(); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: f.active ? "#10B981" : "#6B7280", fontSize: 14 }}>
                      {f.active ? "●" : "○"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
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
  const [showSettings, setShowSettings] = useState(false);
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

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

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
            { label: "🧠 Analyze", fn: () => { setShowSettings(false); setShowAnalysis(!showAnalysis); }, active: showAnalysis },
            { label: "⚙", fn: () => { setShowAnalysis(false); setShowSettings(!showSettings); }, active: showSettings },
          ].map((b, i) => (
            <button key={i} onClick={b.fn} style={{ padding: "7px 12px", background: b.active ? "rgba(79,142,247,0.12)" : "#161B22", border: `1px solid ${b.active ? "#4F8EF7" : "#1E2A3A"}`, borderRadius: 8, color: b.active ? "#4F8EF7" : "#C9D1D9", cursor: "pointer", fontSize: 13, fontFamily: mono, whiteSpace: "nowrap" }}>{b.label}</button>
          ))}
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
                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: cat.color + "15", color: cat.color, fontFamily: mono, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 3, fontSize: 10, background: relColor(item.relevance) + "15", color: relColor(item.relevance), fontFamily: mono, fontWeight: 600 }}>{(item.relevance * 100).toFixed(0)}%</span>
                  <span style={{ color: "#6B7280", fontSize: 10, fontFamily: mono }}>{item.feed_id} · {timeAgo(item.published)}</span>
                  {item.saved ? <span style={{ fontSize: 10 }}>★</span> : null}
                </div>
                {/* Title */}
                <div style={{ color: "#E6EDF3", fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                {/* Summary */}
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
      {showSettings && <SettingsPanel feeds={feeds} onClose={() => setShowSettings(false)} onRefresh={loadData} />}
    </div>
  );
}
