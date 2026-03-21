import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "./api.js";
import { useTheme } from "./useTheme.js";
import { CATEGORIES, mono, sans, timeAgo, relColor } from "./constants.js";
import OrgBadge from "./components/OrgBadge.jsx";
import AnalysisPanel from "./components/AnalysisPanel.jsx";
import SourcesPanel from "./components/SourcesPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import SavedItemsPanel from "./components/SavedItemsPanel.jsx";

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [allItems, setAllItems] = useState([]); // full set from server
  const [feeds, setFeeds] = useState([]);
  const feedNameMap = Object.fromEntries(feeds.map(f => [f.id, f.name]));
  const feedName = (id) => feedNameMap[id] || id;
  const [stats, setStats] = useState({});
  const [llmInfo, setLlmInfo] = useState(null); // { provider, model }
  const [category, setCategory] = useState("all");
  const [minRelevance, setMinRelevance] = useState(0);
  const [maxAgeDays, setMaxAgeDays] = useState(0); // 0 = no limit
  const [search, setSearch] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState([]);
  const [orgCounts, setOrgCounts] = useState([]); // [{ label, count }]
  const [selectedFeedIds, setSelectedFeedIds] = useState([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Client-side filtering + dedup clustering
  const { filteredItems, clusterMap } = useMemo(() => {
    let r = allItems;
    if (minRelevance > 0) r = r.filter(i => i.relevance >= minRelevance);
    if (maxAgeDays > 0) {
      const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
      r = r.filter(i => i.published > cutoff);
    }
    if (selectedOrgs.length > 0) {
      const orgSet = new Set(selectedOrgs);
      r = r.filter(i => (i.affiliations || []).some(a => orgSet.has(a)));
    }
    if (selectedFeedIds.length > 0) {
      const feedSet = new Set(selectedFeedIds);
      r = r.filter(i => feedSet.has(i.feed_id));
    }

    // Build cluster map: clusterId → [items], then keep only the best item per cluster
    const clusters = {};
    const unclustered = [];
    for (const item of r) {
      if (item.cluster_id) {
        if (!clusters[item.cluster_id]) clusters[item.cluster_id] = [];
        clusters[item.cluster_id].push(item);
      } else {
        unclustered.push(item);
      }
    }

    // For each cluster, pick the highest-relevance item as primary
    const cMap = {}; // primaryId → [otherItems]
    const primaries = [];
    for (const items of Object.values(clusters)) {
      if (items.length === 1) {
        unclustered.push(items[0]);
        continue;
      }
      items.sort((a, b) => b.relevance - a.relevance);
      const [primary, ...others] = items;
      primaries.push(primary);
      cMap[primary.id] = others;
    }

    // Merge and re-sort by the original order (filteredItems was already sorted by server)
    const idOrder = new Map(r.map((item, i) => [item.id, i]));
    const result = [...unclustered, ...primaries].sort((a, b) => (idOrder.get(a.id) || 0) - (idOrder.get(b.id) || 0));

    return { filteredItems: result, clusterMap: cMap };
  }, [allItems, minRelevance, maxAgeDays, selectedOrgs, selectedFeedIds]);

  const totalItems = filteredItems.length;
  const items = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const [expandedItem, setExpandedItem] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null); // { stage, pct, detail }
  const refreshAbortRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Fetch from server: only category, search, critical (coarse filters).
  // Relevance, recency, orgs, sources, pagination applied client-side.
  const loadData = useCallback(async () => {
    try {
      const [itemsRes, feedsRes, statsRes, affRes, settingsRes] = await Promise.all([
        api.getItems({
          category: category !== "all" ? category : undefined,
          search: search || undefined,
          unread: criticalOnly ? undefined : true,
          critical: criticalOnly || undefined,
          limit: 500,
        }),
        api.getFeeds(),
        api.getStats(),
        api.getOrgAffiliations(),
        api.getSettings(),
      ]);
      setAllItems(itemsRes.items);
      setFeeds(feedsRes);
      setStats(statsRes);
      setOrgCounts(affRes);
      if (settingsRes) setLlmInfo({ provider: settingsRes.llmProvider || "anthropic", model: settingsRes.llmModel || "" });
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    setLoading(false);
  }, [category, search, criticalOnly]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset to page 0 when any filter changes
  useEffect(() => { setPage(0); }, [category, minRelevance, maxAgeDays, search, criticalOnly, selectedOrgs, selectedFeedIds]);

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
    const abort = new AbortController();
    refreshAbortRef.current = abort;
    setRefreshing(true);
    setRefreshStatus({ stage: "Fetching sources…", pct: 15 });
    try {
      const fetchResult = await api.refreshAll({ signal: abort.signal });
      const newCount = fetchResult?.totalNew || 0;
      setRefreshStatus({ stage: "Scoring items…", pct: 55, detail: newCount ? `${newCount} new` : null });
      const scoreResult = await api.scoreItems({ signal: abort.signal });
      const scored = scoreResult?.scored || 0;
      setRefreshStatus({ stage: "Updating…", pct: 90, detail: scored ? `${scored} scored` : null });
      await loadData();
      setRefreshStatus({ stage: "Done", pct: 100, detail: [newCount && `${newCount} new`, scored && `${scored} scored`].filter(Boolean).join(", ") || "Up to date" });
      setTimeout(() => setRefreshStatus(null), 2500);
    } catch (e) {
      if (e.name === "AbortError" || abort.signal.aborted) {
        setRefreshStatus({ stage: "Cancelled", pct: 100, detail: "Refresh stopped — data is up to date" });
        await loadData(); // reload to pick up any items already fetched/scored
        setTimeout(() => setRefreshStatus(null), 2500);
      } else {
        console.error(e);
        setRefreshStatus({ stage: "Error", pct: 100, detail: e.message });
        setTimeout(() => setRefreshStatus(null), 4000);
      }
    }
    refreshAbortRef.current = null;
    setRefreshing(false);
    setLastRefresh(new Date());
  };

  const handleCancelRefresh = () => {
    if (refreshAbortRef.current) refreshAbortRef.current.abort();
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
        <div style={{ color: "var(--text-muted)", fontFamily: mono, fontSize: 13 }}>Loading sources...</div>
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
              {feeds.filter(f => f.active).length} sources · {stats.unread || 0} unread
              {(stats.critical || 0) > 0 && <>{" · "}<a href="#" onClick={e => { e.preventDefault(); setCriticalOnly(c => !c); }} style={{
                color: criticalOnly ? "white" : "#EF4444", textDecoration: "none", fontWeight: 600,
                background: criticalOnly ? "#EF4444" : "transparent",
                padding: criticalOnly ? "0 5px" : 0, borderRadius: 3,
                transition: "all 0.15s ease",
              }}>{stats.critical} critical</a></>}
              {lastRefresh && ` · refreshed ${timeAgo(lastRefresh.toISOString())}`}
            </div>
          </div>
        </div>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "7px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, flex: 1, minWidth: 120, fontFamily: sans, outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={handleRefresh} disabled={refreshing} title="Refresh all sources and score new items"
            style={{ padding: "7px 14px", background: refreshing ? "var(--accent)" : "var(--accent-bg)", border: "none", borderRadius: 8, color: refreshing ? "white" : "var(--accent)", cursor: refreshing ? "default" : "pointer", fontSize: 13, fontFamily: mono, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: refreshing ? 0.8 : 1 }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 16 }}>↻</span> Refresh
          </button>
          {[
            { icon: "🧠", label: "Brief", panel: "analysis", active: showAnalysis },
            { icon: "★", label: "Saved", panel: "saved", active: showSaved },
            { icon: "📡", label: "Sources", panel: "sources", active: showSources },
          ].map((b, i) => (
            <button key={i} onClick={() => openPanel(b.panel)} title={b.label} style={{ padding: "7px 12px", background: "none", border: "none", borderRadius: 8, color: b.active ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 13, fontFamily: mono, whiteSpace: "nowrap", fontWeight: b.active ? 600 : 400 }}>{b.icon} {b.label}</button>
          ))}
          <button onClick={() => openPanel("settings")} title="Settings" style={{ padding: "7px 8px", background: "none", border: "none", borderRadius: 8, color: showSettings ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>⚙</button>
        </div>
      </header>

      {/* Refresh progress bar — thin strip below header */}
      {refreshStatus && (
        <div style={{ position: "sticky", top: 52, zIndex: 49 }}>
          <div style={{ height: 2, background: "var(--border)" }}>
            <div style={{
              height: "100%",
              width: `${refreshStatus.pct}%`,
              background: refreshStatus.stage === "Error" ? "#EF4444" : refreshStatus.stage === "Cancelled" ? "var(--text-faint)" : "var(--accent)",
              transition: "width 0.6s ease",
              borderRadius: "0 1px 1px 0",
            }} />
          </div>
          <div style={{
            padding: "4px 28px", display: "flex", alignItems: "center", gap: 8,
            fontSize: 10, fontFamily: mono, color: "var(--text-muted)",
            background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
            opacity: refreshStatus.pct === 100 ? 0.6 : 1,
            transition: "opacity 0.5s ease",
          }}>
            <span style={{ color: refreshStatus.stage === "Error" ? "#EF4444" : refreshStatus.stage === "Cancelled" ? "var(--text-muted)" : "var(--accent)", fontWeight: 600 }}>
              {refreshStatus.stage}
            </span>
            {refreshStatus.detail && <span>{refreshStatus.detail}</span>}
            {refreshing && <button onClick={handleCancelRefresh} style={{
              marginLeft: "auto", padding: "1px 8px", background: "none", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer",
            }}>Cancel</button>}
          </div>
        </div>
      )}

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

          <div style={{ marginTop: 20, color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>RECENCY</div>
          <div style={{ padding: "0 8px" }}>
            {(() => {
              // Stops from loosest (left) to tightest (right), matching relevance slider direction
              const stops = [0, 30, 14, 7, 3, 1, 1/3]; // 0 = all time
              const labels = ["All time", "30d", "14d", "7d", "3d", "24h", "8h"];
              const idx = stops.indexOf(maxAgeDays);
              const val = idx >= 0 ? idx : stops.length - 1;
              return (<>
                <input type="range" min="0" max={stops.length - 1} step="1" value={val}
                  onChange={e => setMaxAgeDays(stops[parseInt(e.target.value)])}
                  style={{ width: "100%", accentColor: "var(--accent)", direction: "ltr" }} />
                <div style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: mono, textAlign: "center" }}>{labels[val]}</div>
              </>);
            })()}
          </div>

          {/* Organizations filter */}
          {orgCounts.length > 0 && (<>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", fontWeight: 600 }}>ORGANIZATIONS</div>
              {selectedOrgs.length > 0 && (
                <button onClick={() => setSelectedOrgs([])} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 9, fontFamily: mono, cursor: "pointer", padding: 0 }}>clear</button>
              )}
            </div>
            <div style={{ maxHeight: 180, overflow: "auto", marginTop: 6 }}>
              {orgCounts.map(({ label, count }) => {
                const selected = selectedOrgs.includes(label);
                return (
                  <button key={label} onClick={() => setSelectedOrgs(prev =>
                    selected ? prev.filter(o => o !== label) : [...prev, label]
                  )} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "3px 8px", marginBottom: 1, borderRadius: 4, border: "none",
                    background: selected ? "var(--accent-bg)" : "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <span style={{ color: selected ? "var(--accent)" : "var(--text-secondary)", fontSize: 11, fontFamily: sans, fontWeight: selected ? 600 : 400 }}>{label}</span>
                    <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: mono }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </>)}

          {/* Sources filter */}
          {(() => {
            // Compute per-source stats from actual items for accurate ranking
            const now = Date.now();
            const sourceStats = {};
            for (const item of allItems) {
              const fid = item.feed_id;
              if (!sourceStats[fid]) sourceStats[fid] = { count: 0, totalRel: 0, latestTs: 0 };
              sourceStats[fid].count++;
              sourceStats[fid].totalRel += item.relevance || 0;
              const ts = new Date(item.published).getTime();
              if (ts > sourceStats[fid].latestTs) sourceStats[fid].latestTs = ts;
            }
            const sourceScore = (f) => {
              const s = sourceStats[f.id];
              if (!s) return 0;
              const avgRel = s.count > 0 ? s.totalRel / s.count : 0;
              const ageHours = s.latestTs ? (now - s.latestTs) / 3600000 : 9999;
              // Steep penalty for stale sources: near-zero at 30d, midpoint at 3d
              const freshness = ageHours > 720 ? 0 : 1 / (1 + Math.pow(ageHours / 72, 3));
              return freshness * 0.5 + avgRel * 0.3 + Math.min(1, Math.log10(s.count + 1) / 2) * 0.2;
            };
            const activeFeeds = feeds.filter(f => f.active && sourceStats[f.id]?.count > 0)
              .sort((a, b) => sourceScore(b) - sourceScore(a));
            if (activeFeeds.length === 0) return null;
            return (<>
              <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", fontWeight: 600 }}>SOURCES</div>
                {selectedFeedIds.length > 0 && (
                  <button onClick={() => setSelectedFeedIds([])} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 9, fontFamily: mono, cursor: "pointer", padding: 0 }}>clear</button>
                )}
              </div>
              <div style={{ maxHeight: 180, overflow: "auto", marginTop: 6 }}>
                {activeFeeds.map(f => {
                  const selected = selectedFeedIds.includes(f.id);
                  const count = f.live_items || f.item_count || 0;
                  return (
                    <button key={f.id} onClick={() => setSelectedFeedIds(prev =>
                      selected ? prev.filter(id => id !== f.id) : [...prev, f.id]
                    )} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                      padding: "3px 8px", marginBottom: 1, borderRadius: 4, border: "none",
                      background: selected ? "var(--accent-bg)" : "transparent",
                      cursor: "pointer", textAlign: "left",
                    }}>
                      <span style={{ color: selected ? "var(--accent)" : "var(--text-secondary)", fontSize: 11, fontFamily: sans, fontWeight: selected ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: mono, flexShrink: 0, marginLeft: 4 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </>);
          })()}

        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "20px 28px", maxWidth: 880 }}>
          {llmInfo && (
            <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: sans, fontStyle: "italic", marginBottom: 6 }}>
              Powered by {llmInfo.provider}{llmInfo.model ? ` / ${llmInfo.model}` : ""}
            </div>
          )}
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: mono, fontWeight: 500 }}>
              {criticalOnly ? "CRITICAL ITEMS" : category === "all" ? "ALL SOURCES" : CATEGORIES[category]?.label.toUpperCase()}
              <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>({totalItems})</span>
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {selectedOrgs.length > 0 && (
                <button onClick={() => setSelectedOrgs([])} style={{
                  padding: "4px 10px", background: "var(--accent-bg)", border: "1px solid var(--accent)",
                  borderRadius: 5, color: "var(--accent)", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600,
                }}>{selectedOrgs.length} org{selectedOrgs.length > 1 ? "s" : ""} ✕</button>
              )}
              {selectedFeedIds.length > 0 && (
                <button onClick={() => setSelectedFeedIds([])} style={{
                  padding: "4px 10px", background: "var(--accent-bg)", border: "1px solid var(--accent)",
                  borderRadius: 5, color: "var(--accent)", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600,
                }}>{selectedFeedIds.length} source{selectedFeedIds.length > 1 ? "s" : ""} ✕</button>
              )}
              {criticalOnly && (
                <button onClick={() => setCriticalOnly(false)} style={{
                  padding: "4px 10px", background: "#EF444415", border: "1px solid #EF444440",
                  borderRadius: 5, color: "#EF4444", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600,
                }}>✕ Critical</button>
              )}
            </div>
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
                  <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>{feedName(item.feed_id)} · {timeAgo(item.published)}</span>
                  {item.affiliations?.length > 0 && item.affiliations.map(a => (
                    <OrgBadge key={a} name={a} size={10} />
                  ))}
                  {clusterMap[item.id] && (
                    <span style={{ padding: "0px 5px", borderRadius: 3, fontSize: 9, background: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: mono, fontWeight: 500 }}>
                      {clusterMap[item.id].length + 1} sources
                    </span>
                  )}
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
                    {clusterMap[item.id] && (
                      <div style={{ padding: "6px 10px", background: "var(--bg-elevated)", borderRadius: 6, marginBottom: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4 }}>ALSO COVERED BY</div>
                        {clusterMap[item.id].map(other => (
                          <div key={other.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: sans, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{feedName(other.feed_id)}</span>
                            <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono }}>{timeAgo(other.published)}</span>
                            {other.url && <a href={other.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: "var(--accent)", fontSize: 9, fontFamily: mono, textDecoration: "none" }}>open</a>}
                          </div>
                        ))}
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
                      <button onClick={e => handleMarkRead(e, item)} title="Mark read and dismiss" style={{ padding: "5px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono }}>
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

          {/* Pagination */}
          {totalItems > PAGE_SIZE && (() => {
            const totalPages = Math.ceil(totalItems / PAGE_SIZE);
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "20px 0 10px", fontFamily: mono, fontSize: 12 }}>
                <button onClick={() => setPage(0)} disabled={page === 0}
                  style={{ padding: "5px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: page === 0 ? "var(--text-disabled)" : "var(--text-muted)", cursor: page === 0 ? "default" : "pointer", fontSize: 11, fontFamily: mono }}>
                  ««
                </button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ padding: "5px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: page === 0 ? "var(--text-disabled)" : "var(--text-muted)", cursor: page === 0 ? "default" : "pointer", fontSize: 11, fontFamily: mono }}>
                  ‹ Prev
                </button>
                <span style={{ color: "var(--text-muted)", padding: "0 8px" }}>
                  {page + 1} of {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  style={{ padding: "5px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: page >= totalPages - 1 ? "var(--text-disabled)" : "var(--text-muted)", cursor: page >= totalPages - 1 ? "default" : "pointer", fontSize: 11, fontFamily: mono }}>
                  Next ›
                </button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                  style={{ padding: "5px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: page >= totalPages - 1 ? "var(--text-disabled)" : "var(--text-muted)", cursor: page >= totalPages - 1 ? "default" : "pointer", fontSize: 11, fontFamily: mono }}>
                  »»
                </button>
              </div>
            );
          })()}
        </main>
      </div>

      {/* Panels */}
      {showAnalysis && <AnalysisPanel category={category} onClose={() => setShowAnalysis(false)} />}
      {showSources && <SourcesPanel feeds={feeds} onClose={() => setShowSources(false)} onRefresh={loadData} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} themeMode={themeMode} setThemeMode={setThemeMode} />}
      {showSaved && <SavedItemsPanel onClose={() => setShowSaved(false)} />}
    </div>
  );
}
