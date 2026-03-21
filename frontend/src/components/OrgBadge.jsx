import React from "react";

export default function OrgBadge({ name, size = 10 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "0px 5px", borderRadius: 3, fontSize: size - 1,
      background: "var(--accent-bg-subtle, rgba(79,142,247,0.08))",
      color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
      lineHeight: 1.6,
    }}>
      {name}
    </span>
  );
}
