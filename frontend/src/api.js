const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Feeds
  getFeeds: () => request("/feeds"),
  addFeed: (feed) => request("/feeds", { method: "POST", body: JSON.stringify(feed) }),
  updateFeed: (id, data) => request(`/feeds/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFeed: (id) => request(`/feeds/${id}`, { method: "DELETE" }),

  // Items
  getItems: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    }
    return request(`/items?${qs}`);
  },
  markRead: (id) => request(`/items/${id}/read`, { method: "POST" }),
  toggleSave: (id, saved) => request(`/items/${id}/save`, { method: "POST", body: JSON.stringify({ saved }) }),
  dismissItem: (id) => request(`/items/${id}/dismiss`, { method: "POST" }),
  feedbackItem: (id, feedback) => request(`/items/${id}/feedback`, { method: "POST", body: JSON.stringify({ feedback }) }),
  deleteItem: (id) => request(`/items/${id}`, { method: "DELETE" }),

  // Stats
  getStats: () => request("/stats"),

  // Feed health
  getFeedHealth: () => request("/health/feeds"),
  analyzeFeedHealth: () => request("/health/analyze", { method: "POST" }),

  // Fetch/refresh
  refreshAll: () => request("/fetch", { method: "POST" }),
  refreshFeed: (id) => request(`/fetch/${id}`, { method: "POST" }),

  // LLM
  scoreItems: () => request("/score", { method: "POST" }),
  analyze: (mode, category) =>
    request("/analyze", { method: "POST", body: JSON.stringify({ mode, category }) }),

  // Suggestions
  getSuggestions: () => request("/suggestions"),
  acceptSuggestion: (id) => request(`/suggestions/${id}/accept`, { method: "POST" }),
  dismissSuggestion: (id) => request(`/suggestions/${id}/dismiss`, { method: "POST" }),

  // Settings
  getSettings: () => request("/settings"),
  saveSettings: (settings) => request("/settings", { method: "POST", body: JSON.stringify(settings) }),
};
