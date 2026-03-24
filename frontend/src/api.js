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
  refreshAll: (opts) => request("/fetch", { method: "POST", ...opts }),
  refreshFeed: (id, opts) => request(`/fetch/${id}`, { method: "POST", ...opts }),

  // LLM
  scoreItems: (opts) => request("/score", { method: "POST", ...opts }),
  analyze: (mode, category, { force } = {}) =>
    request("/analyze", { method: "POST", body: JSON.stringify({ mode, category, force }) }),
  analyzeStream: (mode, category, { force, onChunk, onDone, onError } = {}) => {
    const params = new URLSearchParams({ mode });
    if (category) params.set("category", category);
    if (force) params.set("force", "1");
    const evtSource = new EventSource(`${BASE}/analyze/stream?${params}`);
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "chunk") onChunk?.(data.text);
      else if (data.type === "done") { onDone?.(data); evtSource.close(); }
      else if (data.type === "error") { onError?.(data.message); evtSource.close(); }
    };
    evtSource.onerror = () => { onError?.("Connection lost"); evtSource.close(); };
    return evtSource;
  },

  summarizeStream: (itemId, { onChunk, onDone, onError, onProgress } = {}) => {
    const evtSource = new EventSource(`${BASE}/items/${encodeURIComponent(itemId)}/summarize/stream`);
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "chunk") onChunk?.(data.text);
      else if (data.type === "progress") onProgress?.(data.message);
      else if (data.type === "done") { onDone?.(data); evtSource.close(); }
      else if (data.type === "error") { onError?.(data.message); evtSource.close(); }
    };
    evtSource.onerror = () => { onError?.("Connection lost"); evtSource.close(); };
    return evtSource;
  },

  // Suggestions
  getSuggestions: () => request("/suggestions"),
  acceptSuggestion: (id) => request(`/suggestions/${id}/accept`, { method: "POST" }),
  dismissSuggestion: (id) => request(`/suggestions/${id}/dismiss`, { method: "POST" }),

  // Services
  checkServices: () => request("/services/check", { method: "POST" }),

  // Admin
  cleanupItems: (days) => request("/admin/cleanup", { method: "POST", body: JSON.stringify({ days }) }),
  rescoreAll: () => request("/admin/rescore", { method: "POST" }),

  // Embeddings
  getEmbeddingStatus: () => request("/embeddings/status"),

  // Organizations
  getOrgs: () => request("/orgs"),
  getOrgAffiliations: () => request("/orgs/affiliations"),
  addOrg: (org) => request("/orgs", { method: "POST", body: JSON.stringify(org) }),
  updateOrg: (id, data) => request(`/orgs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  removeOrg: (id) => request(`/orgs/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request("/settings"),
  saveSettings: (settings) => request("/settings", { method: "POST", body: JSON.stringify(settings) }),

  // LLM
  testLLM: (provider, model) => request("/llm/test", { method: "POST", body: JSON.stringify({ provider, model }) }),
  getOllamaModels: () => request("/ollama/models"),
};
