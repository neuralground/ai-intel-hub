export const CATEGORIES = {
  research: { label: "AI Research", color: "#4F8EF7", icon: "🔬" },
  engineering: { label: "Engineering & Practice", color: "#10B981", icon: "⚙️" },
  news: { label: "AI News & Announcements", color: "#06B6D4", icon: "📰" },
  industry: { label: "Industry & Capital", color: "#F59E0B", icon: "💰" },
  policy: { label: "Policy & Governance", color: "#EF4444", icon: "🏛️" },
  labs: { label: "AI Labs", color: "#8B5CF6", icon: "🏢" },
};

export const mono = "'JetBrains Mono', monospace";
export const sans = "'IBM Plex Sans', sans-serif";

export function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function relColor(r) {
  if (r >= 0.85) return "#10B981";
  if (r >= 0.65) return "#F59E0B";
  if (r >= 0.4) return "#6B7280";
  return "#4B5563";
}

export function healthColor(status) {
  if (status === "error") return "#EF4444";
  if (status === "delayed") return "#F59E0B";
  if (status === "unknown") return "#4B5563";
  return "#10B981";
}

export function healthLabel(status, avgInterval, hoursSince) {
  if (status === "error") return "Source error";
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
