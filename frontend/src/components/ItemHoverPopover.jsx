import React from "react";
import { CATEGORIES, mono, relColor, timeAgo } from "../constants";
import OrgBadge from "./OrgBadge";

export default function ItemHoverPopover({ item, anchor, onClose, onSave, onMarkRead, onMouseEnter, feedLabel }) {
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
