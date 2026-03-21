import { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import { api } from "../api.js";
import { CATEGORIES, mono, sans, timeAgo, relColor } from "../constants.js";
import ItemHoverPopover from "./ItemHoverPopover";

export default function AnalysisPanel({ category, onClose }) {
  const [mode, setMode] = useState("briefing");
  const [result, setResult] = useState("");
  const [sourceItems, setSourceItems] = useState({});
  const [hoverItem, setHoverItem] = useState(null); // { item, anchor }
  const hoverTimerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [cached, setCached] = useState(false);
  const [llmLabel, setLlmLabel] = useState("");

  const run = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setResult("");
    setSourceItems({});
    setHoverItem(null);
    setGeneratedAt(null);
    setCached(false);
    try {
      const data = await api.analyze(mode, category !== "all" ? category : null, { force });
      setResult(data.result);
      if (data.sourceItems) setSourceItems(data.sourceItems);
      if (data.generatedAt) setGeneratedAt(data.generatedAt);
      setCached(!!data.cached);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [mode, category]);

  useEffect(() => { run(); }, [run]);

  useEffect(() => {
    api.getSettings().then(s => {
      const provider = s.analysisProvider || s.llmProvider || "anthropic";
      const model = s.analysisModel || s.llmModel || "";
      setLlmLabel(`${provider}${model ? ` / ${model}` : ""}`);
    }).catch(() => {});
  }, []);

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
    { key: "briefing", label: "Daily Summary" },
    { key: "risks", label: "Risk Scan" },
    { key: "what-so-what-now-what", label: "What / So What / Now What" },
  ];

  // Custom link renderer:
  //   item:ID  → opens item popover
  //   feed:URL → shows source name + inline Add button
  //   other    → opens externally
  const renderLink = ({ href, children }) => {
    // Match #item-ID or item:ID formats
    const itemMatch = href?.match(/^(?:#item-|item:)(.+)$/);
    if (!itemMatch) {
      // Also check if href is an actual URL that matches a source item
      const matchedItem = Object.values(sourceItems).find(it => it.url && href === it.url);
      if (matchedItem) {
        return renderLink({ href: `#item-${matchedItem.id}`, children });
      }
    }
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
        {loading && (
          <div>
            <div style={{ height: 2, background: "var(--border)", borderRadius: 1, marginBottom: 10 }}>
              <div style={{ height: "100%", width: "60%", background: "var(--accent)", borderRadius: 1, animation: "analyzeProgress 2s ease-in-out infinite" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontFamily: mono, fontSize: 11 }}>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>Generating {modes.find(m => m.key === mode)?.label || "analysis"}...</span>
              <span>This may take 10-20 seconds</span>
            </div>
          </div>
        )}
        {error && <div style={{ color: "#EF4444", fontFamily: mono, fontSize: 13 }}>⚠ {error}</div>}
        {!loading && result && (
          <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
            {llmLabel && <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: sans, fontStyle: "italic", marginBottom: 4 }}>Powered by {llmLabel}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>
              {generatedAt ? `Generated ${timeAgo(generatedAt)}` : ""}
              {cached && " (cached)"}
            </span>
            <button onClick={() => run(true)} style={{
              padding: "3px 10px", background: "none", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-muted)", fontSize: 9, fontFamily: mono, cursor: "pointer",
            }}>Regenerate</button>
          </div>
          </div>
        )}
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
