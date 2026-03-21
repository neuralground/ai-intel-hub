import React from "react";
import { mono } from "../constants";

export default function ThemeToggle({ mode, setMode }) {
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
