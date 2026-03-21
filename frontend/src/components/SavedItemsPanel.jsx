import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";
import { CATEGORIES, mono, sans, relColor, timeAgo } from "../constants";

export default function SavedItemsPanel({ onClose }) {
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
