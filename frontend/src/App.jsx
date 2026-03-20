import { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import { api } from "./api.js";
import { useTheme } from "./useTheme.js";

const CATEGORIES = {
  research: { label: "AI Research", color: "#4F8EF7", icon: "🔬" },
  engineering: { label: "Engineering & Practice", color: "#10B981", icon: "⚙️" },
  news: { label: "AI News & Announcements", color: "#06B6D4", icon: "📰" },
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

// ── Org logo component for affiliation badges ──────────────────────────────
const ORG_LOGOS = {
  Google: (s) => <svg viewBox="0 0 24 24" width={s} height={s}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
  OpenAI: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"><path d="M22.28 9.82a5.99 5.99 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18 5.99 5.99 0 0 0 .98 7.08a6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .52 4.91 6.05 6.05 0 0 0 6.51 2.9A5.99 5.99 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.68l5.82 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87zm16.6 3.86l-5.83-3.39L15.12 7.2a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.66zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.3 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.08a4.5 4.5 0 0 1 7.38-3.46l-.14.08-4.78 2.76a.8.8 0 0 0-.39.68zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z"/></svg>,
  Anthropic: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"><path d="M13.83 3.52h3.6L24 20.48h-3.6l-6.57-16.96zm-7.26 0h3.77L16.9 20.48h-3.67l-1.47-3.64H5.04l-1.5 3.64H0L6.57 3.52zm1.04 5.67l-2.56 6.18h5.24l-2.68-6.18z"/></svg>,
  Meta: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"><path d="M6.92 6.2c-.84 0-1.63.55-2.38 1.63-.98 1.41-1.85 3.53-2.42 5.22-.4 1.18-.56 2.09-.56 2.72 0 1.09.42 1.79 1.28 1.79.85 0 1.84-.84 3.08-2.7.7-1.06 1.4-2.3 2.02-3.5L9.4 8.7c-.65-1.29-1.45-2.5-2.48-2.5zm10.16 0c-1.03 0-1.83 1.21-2.48 2.5l1.46 2.66c.62 1.2 1.32 2.44 2.02 3.5 1.24 1.86 2.23 2.7 3.08 2.7.86 0 1.28-.7 1.28-1.79 0-.63-.16-1.54-.56-2.72-.57-1.69-1.44-3.81-2.42-5.22-.75-1.08-1.54-1.63-2.38-1.63zM12 10.47c-.55 1-1.12 2.02-1.7 3l-.24.42.24.44c.58.98 1.15 2 1.7 3 .55-1 1.12-2.02 1.7-3l.24-.44-.24-.42c-.58-.98-1.15-2-1.7-3z"/></svg>,
  Microsoft: (s) => <svg viewBox="0 0 24 24" width={s} height={s}><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>,
  Apple: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
  Amazon: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor"><path d="M.045 18.02c.07-.116.196-.064.28-.022.312.15.624.313.95.442 1.172.467 2.397.784 3.668.95a13.5 13.5 0 0 0 4.59-.06c1.27-.237 2.47-.67 3.6-1.27.065-.032.13-.078.196-.078.08 0 .12.063.12.14 0 .054-.03.103-.07.152-.512.613-1.143 1.105-1.842 1.487-1.13.612-2.35 1.002-3.61 1.186a13.4 13.4 0 0 1-4.12-.114C2.67 20.6 1.57 20.16.62 19.48c-.104-.074-.24-.167-.24-.3 0-.04.01-.12.045-.16zm6.612-5.48c0-.8.02-1.46.06-1.99.04-.54.13-.99.26-1.35.14-.37.33-.65.58-.85.24-.2.56-.35.95-.44.4-.1.87-.14 1.42-.14.55 0 1 .05 1.39.14.38.1.7.24.94.44.25.2.43.48.57.85.13.36.22.81.26 1.35.04.53.06 1.19.06 1.99s-.02 1.46-.06 1.99c-.04.54-.13.99-.26 1.35-.14.37-.33.65-.57.85-.24.2-.56.35-.94.44-.39.1-.84.14-1.39.14-.55 0-1.02-.05-1.42-.14-.39-.1-.71-.24-.95-.44-.25-.2-.44-.48-.58-.85-.13-.36-.22-.81-.26-1.35-.04-.53-.06-1.19-.06-1.99z"/></svg>,
  NVIDIA: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="#76B900"><path d="M8.95 8.57V6.35c.18-.02.36-.03.55-.03 3.37 0 6.06 2.88 6.06 5.93 0 .17 0 .33-.02.5h2.25c.01-.16.02-.33.02-.5 0-4.5-3.73-8.13-8.3-8.15h-.56V2L5 5.29l3.95 3.28zm0 6.85V17.65c.18.02.36.03.55.03 3.37 0 6.06-2.88 6.06-5.93 0-.17 0-.33-.02-.5h2.25c.01.16.02.33.02.5 0 4.5-3.73 8.13-8.3 8.15h-.56v2.1L5 18.71l3.95-3.29z"/></svg>,
  Stanford: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="#8C1515"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.18L18.82 7.5v8.18L12 19.36 5.18 15.68V7.5L12 4.18zM12 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 3v6h1v-2.5h2V17h1v-6h-1v2.5h-2V11h-1z"/></svg>,
  MIT: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="#A31F34"><rect x="1" y="3" width="4" height="18"/><rect x="7" y="3" width="4" height="10"/><rect x="13" y="3" width="4" height="18"/><rect x="19" y="3" width="4" height="4"/><rect x="19" y="9" width="4" height="12"/></svg>,
  CMU: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="#C41230"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-4 12v-1c0-2 4-3.1 4-3.1s4 1.1 4 3.1v1H8z"/></svg>,
  Berkeley: (s) => <svg viewBox="0 0 24 24" width={s} height={s} fill="#003262"><path d="M12 2L3 7v2h18V7L12 2zm-7 9v6l7 5 7-5v-6l-7 3-7-3z"/></svg>,
};

function OrgBadge({ name, size = 10 }) {
  const Logo = ORG_LOGOS[name];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "0px 5px", borderRadius: 3, fontSize: size - 1,
      background: "var(--accent-bg-subtle, rgba(79,142,247,0.08))",
      color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
      lineHeight: 1.6,
    }}>
      {Logo && <span style={{ display: "inline-flex", flexShrink: 0 }}>{Logo(size)}</span>}
      {!Logo && name}
    </span>
  );
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
function ItemHoverPopover({ item, anchor, onClose, onSave, onMarkRead, onMouseEnter, feedLabel }) {
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
        <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono }}>{feedLabel || item.feed_name || item.feed_id} · {timeAgo(item.published)}</span>
        {item.affiliations?.length > 0 && item.affiliations.map(a => (
          <OrgBadge key={a} name={a} size={9} />
        ))}
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

  // Parse feed suggestions out of the markdown for card-style rendering.
  // Catches both #feed-URL and plain https:// URLs in markdown links.
  const parseFeedSuggestions = (md) => {
    if (!md) return [];
    const suggestions = [];
    const seen = new Set();
    // Match [Name](#feed-URL) — reason  OR  [Name](https://...) — reason
    const regex = /\[([^\]]+)\]\((#feed-|https?:\/\/)([^)]+)\)\s*—?\s*(.*)/g;
    let m;
    while ((m = regex.exec(md)) !== null) {
      const url = m[2] === "#feed-" ? m[3] : m[2] + m[3];
      // Skip item references and non-feed URLs
      if (url.startsWith("#item-")) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      suggestions.push({ name: m[1], url, reason: m[4].trim() });
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
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.7, fontFamily: sans }}>
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
                          <label onClick={e => toggleAuthoritative(e, f)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 4 }}>
                            <input type="checkbox" checked={!!f.authoritative} readOnly
                              style={{ accentColor: "var(--accent)", width: 13, height: 13, cursor: "pointer" }} />
                            <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: mono }}>Authoritative source</span>
                            <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: sans }}> — items from this feed count toward critical alerts</span>
                          </label>
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

// ── LLM Provider Definitions ────────────────────────────────────────────────
const LLM_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    logo: props => (
      <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill={props.color || "currentColor"}>
        <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.471-3.635H5.036l-1.5 3.635H0L6.569 3.52zm1.04 5.667l-2.56 6.18h5.236l-2.677-6.18z"/>
      </svg>
    ),
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514"],
    authType: "apiKey",
    keyField: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: props => (
      <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill={props.color || "currentColor"}>
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
    authType: "apiKey",
    keyField: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    logo: props => (
      <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill="none">
        <path d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12z" fill={props.color || "#886FBF"}/>
      </svg>
    ),
    models: ["gemini-2.0-flash", "gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-preview-04-17"],
    authType: "apiKey",
    keyField: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
  },
  {
    id: "ollama",
    name: "Ollama",
    logo: props => (
      <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} fill={props.color || "currentColor"}>
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2.5a3.5 3.5 0 0 1 3.5 3.5c0 1.268-.684 2.379-1.7 2.987.442.328.78.782.976 1.306A3.5 3.5 0 0 1 17.5 15.5c0 1.934-1.566 3.5-3.5 3.5h-4c-1.934 0-3.5-1.566-3.5-3.5a3.49 3.49 0 0 1 2.724-3.407A3.49 3.49 0 0 1 8.5 8 3.5 3.5 0 0 1 12 4.5zM10.75 9a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm2.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"/>
      </svg>
    ),
    models: [],
    authType: "local",
    urlField: "OLLAMA_BASE_URL",
    urlDefault: "http://localhost:11434",
  },
];

// ── Organizations Manager (Settings sub-panel) ─────────────────────────────
function OrgManager({ orgs, onUpdate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("company");
  const [newAliases, setNewAliases] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [confirmRescan, setConfirmRescan] = useState(false); // after adding, offer rescan
  const [lastAdded, setLastAdded] = useState(null);

  const label = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };
  const hint = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };
  const inp = { padding: "6px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", fontSize: 12, fontFamily: sans, outline: "none", width: "100%" };
  const btnBase = { padding: "5px 12px", borderRadius: 5, fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600 };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    const id = newLabel.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const aliases = newAliases.split(",").map(a => a.trim()).filter(Boolean);
    try {
      const r = await api.addOrg({ id, label: newLabel.trim(), type: newType, aliases });
      if (r.added) {
        setLastAdded(newLabel.trim());
        setNewLabel(""); setNewAliases(""); setShowAdd(false);
        setConfirmRescan(true);
        onUpdate();
      }
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  const handleRemove = async (orgId) => {
    try {
      await api.removeOrg(orgId);
      onUpdate();
    } catch (e) { console.error(e); }
  };

  const handleRescan = async () => {
    setConfirmRescan(false);
    setScanning(true);
    setScanResult(null);
    try {
      const r = await api.rescoreAll();
      setScanResult(`Scanned ${r.reset} items, updated ${r.scored} scores`);
    } catch (e) { setScanResult("Scan failed: " + e.message); }
    setScanning(false);
  };

  // Separate builtins from user-added (builtins have known IDs from the 34 defaults)
  const BUILTIN_IDS = new Set(["google","openai","anthropic","meta","microsoft","apple","amazon","nvidia","xai","mistral","cohere","huggingface","baidu","tencent","alibaba","bytedance","samsung","intel","ibm","salesforce","stanford","mit","cmu","berkeley","harvard","princeton","oxford","cambridge","eth","tsinghua","peking","toronto","mila","ai2"]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600 }}>Organizations</div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>
      <div style={hint}>The AI identifies author affiliations with these organizations during scoring. Items from affiliated authors show org badges and count toward the sidebar filter.</div>

      {/* Add new org form */}
      {showAdd && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>
            <label style={label}>NAME</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Stability AI" style={inp} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={label}>TYPE</label>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inp, cursor: "pointer", appearance: "auto" }}>
              <option value="company">Company</option>
              <option value="lab">AI Lab</option>
              <option value="university">University</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={label}>ALIASES (comma-separated, optional)</label>
            <input value={newAliases} onChange={e => setNewAliases(e.target.value)} placeholder="e.g. Stability, SDXL Team" style={inp} />
          </div>
          <button onClick={handleAdd} disabled={adding || !newLabel.trim()}
            style={{ ...btnBase, background: newLabel.trim() ? "var(--accent)" : "var(--bg-input)", border: "none", color: newLabel.trim() ? "white" : "var(--text-disabled)" }}>
            {adding ? "Adding..." : "Add Organization"}
          </button>
        </div>
      )}

      {/* Rescan prompt after adding */}
      {confirmRescan && (
        <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--accent-bg-subtle, rgba(79,142,247,0.06))", border: "1px solid var(--accent)", borderRadius: 6 }}>
          <div style={{ color: "var(--text-primary)", fontSize: 11, marginBottom: 6 }}>
            Added <strong>{lastAdded}</strong>. Scan existing items for this affiliation?
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 8 }}>This will re-score all items so the LLM can detect affiliations with the new organization. This may take several minutes.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleRescan} style={{ ...btnBase, background: "var(--accent)", border: "none", color: "white" }}>Scan now</button>
            <button onClick={() => setConfirmRescan(false)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Skip</button>
          </div>
        </div>
      )}

      {scanning && (
        <div style={{ marginTop: 6, color: "var(--accent)", fontSize: 10, fontFamily: mono }}>Scanning items... this may take a few minutes</div>
      )}
      {scanResult && (
        <div style={{ marginTop: 6, color: "#10B981", fontSize: 10, fontFamily: mono }}>{scanResult}</div>
      )}

      {/* Org list */}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {orgs.map(o => (
          <span key={o.id} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 4,
            background: "var(--bg-input)", border: "1px solid var(--border)",
            fontSize: 10, fontFamily: mono, color: "var(--text-secondary)",
          }}>
            {ORG_LOGOS[o.label] && <span style={{ display: "inline-flex" }}>{ORG_LOGOS[o.label](11)}</span>}
            {o.label}
            <span style={{ color: "var(--text-faint)", fontSize: 8 }}>{o.type}</span>
            {!BUILTIN_IDS.has(o.id) && (
              <button onClick={() => handleRemove(o.id)} title="Remove" style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, lineHeight: 1 }}>✕</button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Advanced Settings Sub-panel ─────────────────────────────────────────────
function AdvancedSection() {
  const [expanded, setExpanded] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("7");
  const [confirm, setConfirm] = useState(null); // 'cleanup' | 'cleanup-all' | 'rescore'
  const [running, setRunning] = useState(null); // 'cleanup' | 'rescore'
  const [result, setResult] = useState(null); // { message, type: 'ok'|'error' }

  const label = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };
  const hint = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };
  const btnBase = { padding: "6px 14px", borderRadius: 6, fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 };

  const handleCleanup = async (days) => {
    setConfirm(null);
    setRunning("cleanup");
    setResult(null);
    try {
      const r = await api.cleanupItems(days);
      setResult({ message: `Removed ${r.removed} item${r.removed !== 1 ? "s" : ""}`, type: "ok" });
    } catch (e) {
      setResult({ message: e.message, type: "error" });
    }
    setRunning(null);
  };

  const handleRescore = async () => {
    setConfirm(null);
    setRunning("rescore");
    setResult(null);
    try {
      const r = await api.rescoreAll();
      setResult({ message: `Reset ${r.reset} items, re-scored ${r.scored}`, type: "ok" });
    } catch (e) {
      setResult({ message: e.message, type: "error" });
    }
    setRunning(null);
  };

  if (!expanded) {
    return (
      <div>
        <button onClick={() => setExpanded(true)} style={{
          ...btnBase, background: "none", border: "1px solid var(--border)",
          color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6, width: "100%",
          justifyContent: "center", padding: "8px",
        }}>
          Advanced ▾
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600 }}>Advanced</div>
        <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 10, fontFamily: mono }}>▴ collapse</button>
      </div>

      {/* Cleanup Items */}
      <div style={{ marginBottom: 14 }}>
        <label style={label}>CLEAR OLD ITEMS</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: mono }}>Older than</span>
          <input type="number" min="1" max="365" value={cleanupDays}
            onChange={e => setCleanupDays(e.target.value)}
            style={{ width: 55, padding: "5px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", fontSize: 12, fontFamily: mono, textAlign: "center", outline: "none" }} />
          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: mono }}>days</span>
          <button onClick={() => setConfirm("cleanup")} disabled={!!running}
            style={{ ...btnBase, marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            {running === "cleanup" ? "Clearing..." : "Clear"}
          </button>
        </div>
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setConfirm("cleanup-all")} disabled={!!running}
            style={{ ...btnBase, background: "transparent", border: "1px solid #EF444440", color: "#EF4444", fontSize: 10 }}>
            Clear all items
          </button>
        </div>
        <div style={hint}>Removes items older than the specified age. Saved items are always preserved.</div>
      </div>

      {/* Re-score */}
      <div style={{ marginBottom: 14 }}>
        <label style={label}>RE-SCORE ALL ITEMS</label>
        <button onClick={() => setConfirm("rescore")} disabled={!!running}
          style={{ ...btnBase, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {running === "rescore" ? "Scoring..." : "Re-score all items"}
        </button>
        <div style={hint}>Resets all relevance scores and re-runs LLM scoring from scratch. Useful after changing your role, scoring instructions, or LLM provider.</div>
      </div>

      {/* Result message */}
      {result && (
        <div style={{ padding: "6px 10px", borderRadius: 5, fontSize: 11, fontFamily: mono,
          background: result.type === "ok" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          color: result.type === "ok" ? "#10B981" : "#EF4444", marginBottom: 10,
        }}>{result.message}</div>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div style={{
          padding: "12px 14px", borderRadius: 8, border: "1px solid #EF444440",
          background: "var(--bg-elevated)", marginBottom: 10,
        }}>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 6 }}>
            {confirm === "rescore" ? "Re-score all items?" : confirm === "cleanup-all" ? "Clear ALL items?" : `Clear items older than ${cleanupDays} days?`}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
            {confirm === "rescore"
              ? "This will reset all relevance scores, affiliations, and tags, then re-run LLM scoring. This may take several minutes and use API credits."
              : confirm === "cleanup-all"
                ? "This will permanently remove all items from the database except saved items. This cannot be undone."
                : `This will permanently remove all items published more than ${cleanupDays} days ago. Saved items are preserved.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => confirm === "rescore" ? handleRescore() : handleCleanup(confirm === "cleanup-all" ? 0 : parseInt(cleanupDays))}
              style={{ ...btnBase, background: "#EF4444", border: "none", color: "white" }}>
              {confirm === "rescore" ? "Re-score" : "Clear"}
            </button>
            <button onClick={() => setConfirm(null)}
              style={{ ...btnBase, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Cancel
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
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaError, setOllamaError] = useState(null);
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(console.error);
    api.getSettings().then(s => {
      setSettings(s);
      setForm({
        llmProvider: s.llmProvider || "anthropic",
        llmModel: s.llmModel || "",
        anthropicKey: "",
        openaiKey: "",
        geminiKey: "",
        ollamaUrl: s.ollamaBaseUrl || "http://localhost:11434",
        relevanceContext: s.relevanceContext || "",
        scoringInstructions: s.scoringInstructions || "",
        refreshInterval: s.refreshInterval || "30",
      });
      // If Ollama is selected, fetch models
      if ((s.llmProvider || "anthropic") === "ollama") {
        fetchOllamaModels();
      }
    }).catch(console.error);
  }, []);

  const fetchOllamaModels = () => {
    setOllamaError(null);
    api.getOllamaModels().then(r => {
      if (r.error) setOllamaError(r.error);
      else setOllamaModels(r.models || []);
    }).catch(e => setOllamaError(e.message));
  };

  const handleProviderChange = (providerId) => {
    const provider = LLM_PROVIDERS.find(p => p.id === providerId);
    setForm(f => ({
      ...f,
      llmProvider: providerId,
      llmModel: provider?.models?.[0] || "",
    }));
    if (providerId === "ollama") fetchOllamaModels();
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = {};
    if (form.llmProvider !== (settings?.llmProvider || "anthropic")) updates.LLM_PROVIDER = form.llmProvider;
    if (form.llmModel) updates.LLM_MODEL = form.llmModel;
    if (form.anthropicKey) updates.ANTHROPIC_API_KEY = form.anthropicKey;
    if (form.openaiKey) updates.OPENAI_API_KEY = form.openaiKey;
    if (form.geminiKey) updates.GEMINI_API_KEY = form.geminiKey;
    if (form.ollamaUrl !== (settings?.ollamaBaseUrl || "http://localhost:11434")) updates.OLLAMA_BASE_URL = form.ollamaUrl;
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

        {/* LLM Provider */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>LLM Provider</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
            {LLM_PROVIDERS.map(p => {
              const selected = form.llmProvider === p.id;
              const hasKey = p.id === "anthropic" ? settings.hasApiKey
                : p.id === "openai" ? settings.hasOpenaiKey
                : p.id === "gemini" ? settings.hasGeminiKey
                : p.id === "ollama";
              return (
                <button key={p.id} onClick={() => handleProviderChange(p.id)} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "12px 8px", borderRadius: 8, cursor: "pointer",
                  background: selected ? "var(--accent-bg)" : "var(--bg-input)",
                  border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                  transition: "all 0.15s ease",
                }}>
                  <p.logo size={28} color={selected ? "var(--accent)" : "var(--text-muted)"} />
                  <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 600, color: selected ? "var(--accent)" : "var(--text-muted)" }}>{p.name}</span>
                  {hasKey && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />}
                </button>
              );
            })}
          </div>

          {/* Model selector */}
          {(() => {
            const provider = LLM_PROVIDERS.find(p => p.id === form.llmProvider);
            if (!provider) return null;
            const models = form.llmProvider === "ollama" ? ollamaModels : provider.models;
            return (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>MODEL</label>
                {models.length > 0 ? (
                  <select value={form.llmModel} onChange={e => setForm(f => ({ ...f, llmModel: e.target.value }))}
                    style={{ ...inp, cursor: "pointer", appearance: "auto" }}>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input value={form.llmModel} onChange={e => setForm(f => ({ ...f, llmModel: e.target.value }))}
                    placeholder={form.llmProvider === "ollama" ? "e.g. llama3.2, mistral, gemma2" : "model name"}
                    style={inp} />
                )}
                {form.llmProvider === "ollama" && ollamaError && (
                  <div style={{ ...hint, color: "#EF4444" }}>Could not reach Ollama: {ollamaError}</div>
                )}
                {form.llmProvider === "ollama" && !ollamaError && ollamaModels.length > 0 && (
                  <div style={{ ...hint, color: "#10B981" }}>{ollamaModels.length} model{ollamaModels.length !== 1 ? "s" : ""} available locally</div>
                )}
              </div>
            );
          })()}

          {/* Provider-specific auth */}
          {(() => {
            const provider = LLM_PROVIDERS.find(p => p.id === form.llmProvider);
            if (!provider) return null;

            if (provider.authType === "apiKey") {
              const formKey = form.llmProvider === "anthropic" ? "anthropicKey"
                : form.llmProvider === "openai" ? "openaiKey" : "geminiKey";
              const hasKey = form.llmProvider === "anthropic" ? settings.hasApiKey
                : form.llmProvider === "openai" ? settings.hasOpenaiKey : settings.hasGeminiKey;
              const maskedKey = form.llmProvider === "anthropic" ? settings.anthropicApiKey
                : form.llmProvider === "openai" ? settings.openaiApiKey : settings.geminiApiKey;
              return (
                <div>
                  <label style={label}>API KEY {hasKey && <span style={{ color: "#10B981" }}>(configured)</span>}</label>
                  <input type="password" value={form[formKey]}
                    onChange={e => setForm(f => ({ ...f, [formKey]: e.target.value }))}
                    placeholder={hasKey ? maskedKey : provider.keyPlaceholder} style={inp} />
                  <div style={hint}>Leave blank to keep current key.</div>
                </div>
              );
            }

            if (provider.authType === "local") {
              return (
                <div>
                  <label style={label}>OLLAMA SERVER URL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={form.ollamaUrl}
                      onChange={e => setForm(f => ({ ...f, ollamaUrl: e.target.value }))}
                      placeholder="http://localhost:11434" style={{ ...inp, flex: 1 }} />
                    <button onClick={fetchOllamaModels} style={{
                      padding: "8px 14px", background: "var(--bg-input)", border: "1px solid var(--border)",
                      borderRadius: 6, color: "var(--text-muted)", fontSize: 11, fontFamily: mono, cursor: "pointer",
                    }}>Test</button>
                  </div>
                  <div style={hint}>Ollama runs locally — no API key needed. Install from ollama.com.</div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Refresh Interval */}
        <div>
          <label style={label}>FEED REFRESH INTERVAL (MINUTES)</label>
          <input type="number" min="5" max="1440" value={form.refreshInterval} onChange={e => setForm(f => ({ ...f, refreshInterval: e.target.value }))} style={{ ...inp, width: 120 }} />
        </div>

        {/* Organizations */}
        <OrgManager orgs={orgs} onUpdate={() => api.getOrgs().then(setOrgs).catch(console.error)} />

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

        {/* Advanced */}
        <AdvancedSection />
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
          ...Object.entries(CATEGORIES).filter(([k]) => catCounts[k]).map(([k, v]) => ({ key: k, label: `${v.label} (${catCounts[k]})` }))
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
  const feedNameMap = Object.fromEntries(feeds.map(f => [f.id, f.name]));
  const feedName = (id) => feedNameMap[id] || id;
  const [stats, setStats] = useState({});
  const [category, setCategory] = useState("all");
  const [minRelevance, setMinRelevance] = useState(0);
  const [search, setSearch] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState([]);
  const [orgCounts, setOrgCounts] = useState([]); // [{ label, count }]
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 25;
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

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, feedsRes, statsRes, affRes] = await Promise.all([
        api.getItems({
          category: category !== "all" ? category : undefined, minRelevance, search, unread: true,
          critical: criticalOnly || undefined,
          orgs: selectedOrgs.length > 0 ? selectedOrgs.join(",") : undefined,
          limit: PAGE_SIZE, offset: page * PAGE_SIZE,
        }),
        api.getFeeds(),
        api.getStats(),
        api.getOrgAffiliations(),
      ]);
      setItems(itemsRes.items);
      setTotalItems(itemsRes.total);
      setFeeds(feedsRes);
      setStats(statsRes);
      setOrgCounts(affRes);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    setLoading(false);
  }, [category, minRelevance, search, criticalOnly, selectedOrgs, page]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [category, minRelevance, search, criticalOnly, selectedOrgs]);

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
    setRefreshStatus({ stage: "Fetching feeds…", pct: 15 });
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
              {feeds.filter(f => f.active).length} feeds · {stats.unread || 0} unread
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
          <button onClick={handleRefresh} disabled={refreshing} title="Refresh all feeds and score new items"
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
        <div style={{ position: "sticky", top: 52, zIndex: 49, height: 0 }}>
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
                const Logo = ORG_LOGOS[label];
                return (
                  <button key={label} onClick={() => setSelectedOrgs(prev =>
                    selected ? prev.filter(o => o !== label) : [...prev, label]
                  )} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "3px 8px", marginBottom: 1, borderRadius: 4, border: "none",
                    background: selected ? "var(--accent-bg)" : "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: selected ? "var(--accent)" : "var(--text-secondary)", fontSize: 11, fontFamily: sans, fontWeight: selected ? 600 : 400 }}>
                      {Logo && <span style={{ display: "inline-flex", flexShrink: 0 }}>{Logo(11)}</span>}
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: mono }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </>)}

          <div style={{ marginTop: 20, color: "var(--text-faint)", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>THEME</div>
          <ThemeToggle mode={themeMode} setMode={setThemeMode} />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "20px 28px", maxWidth: 880 }}>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: mono, fontWeight: 500 }}>
              {criticalOnly ? "CRITICAL ITEMS" : category === "all" ? "ALL FEEDS" : CATEGORIES[category]?.label.toUpperCase()}
              <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>({totalItems})</span>
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {selectedOrgs.length > 0 && (
                <button onClick={() => setSelectedOrgs([])} style={{
                  padding: "4px 10px", background: "var(--accent-bg)", border: "1px solid var(--accent)",
                  borderRadius: 5, color: "var(--accent)", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600,
                }}>{selectedOrgs.length} org{selectedOrgs.length > 1 ? "s" : ""} ✕</button>
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
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showSaved && <SavedItemsPanel onClose={() => setShowSaved(false)} />}
    </div>
  );
}
