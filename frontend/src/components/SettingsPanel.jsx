import { useState, useEffect } from "react";
import { api } from "../api.js";
import { mono, sans } from "../constants.js";
import { SERVICES, ServiceCard } from "./services.jsx";
import OrgBadge from "./OrgBadge.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

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

// ── Connected Services Section (Settings sub-panel) ─────────────────────────
function ConnectedServicesSection({ settings, onConnect, onDisconnect }) {
  const [serviceHealth, setServiceHealth] = useState({}); // { TWITTER_SESSION: { ok, ... } }
  const [showAddService, setShowAddService] = useState(false);
  const [newService, setNewService] = useState({ name: "", cookieName: "", checkUrl: "", description: "" });
  const [customServices, setCustomServices] = useState([]);

  const hint = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };
  const lbl = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };
  const inp = { padding: "6px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", fontSize: 12, fontFamily: sans, outline: "none", width: "100%" };
  const btnBase = { padding: "5px 12px", borderRadius: 5, fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600 };

  // Check service health on mount
  useEffect(() => {
    api.checkServices().then(setServiceHealth).catch(console.error);
  }, []);

  const allServices = [...SERVICES, ...customServices];

  const handleAddService = () => {
    if (!newService.name.trim()) return;
    const id = newService.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const envKey = id.toUpperCase().replace(/-/g, "_") + "_SESSION";
    const settingsKey = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Session";
    const svc = {
      id,
      name: newService.name.trim(),
      settingsKey,
      envKey,
      description: newService.description.trim() || `Connect to ${newService.name.trim()}.`,
      electronAuth: false,
      manualPlaceholder: newService.cookieName ? `Paste ${newService.cookieName} cookie value...` : "Paste session token...",
      manualHelpText: newService.cookieName
        ? `In your browser: log in to the service, then open DevTools (F12) > Application > Cookies and copy the '${newService.cookieName}' value.`
        : "Paste the session token or cookie value for this service.",
    };
    setCustomServices(prev => [...prev, svc]);
    setNewService({ name: "", cookieName: "", checkUrl: "", description: "" });
    setShowAddService(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600 }}>Connected Services</div>
        <button onClick={() => setShowAddService(!showAddService)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {showAddService ? "Cancel" : "+ Add"}
        </button>
      </div>
      <div style={hint}>Connect to third-party services for authenticated source access. Service health is checked when settings are opened.</div>

      {/* Add service form */}
      {showAddService && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>SERVICE NAME</label>
            <input value={newService.name} onChange={e => setNewService(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Bluesky" style={inp} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>COOKIE NAME (optional)</label>
            <input value={newService.cookieName} onChange={e => setNewService(s => ({ ...s, cookieName: e.target.value }))} placeholder="e.g. session_token" style={inp} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>DESCRIPTION (optional)</label>
            <input value={newService.description} onChange={e => setNewService(s => ({ ...s, description: e.target.value }))} placeholder="e.g. Access Bluesky posts and threads" style={inp} />
          </div>
          <button onClick={handleAddService} disabled={!newService.name.trim()}
            style={{ ...btnBase, background: newService.name.trim() ? "var(--accent)" : "var(--bg-input)", border: "none", color: newService.name.trim() ? "white" : "var(--text-disabled)" }}>
            Add Service
          </button>
        </div>
      )}

      <div style={{ marginTop: 10, maxHeight: 320, overflow: "auto" }}>
        {allServices.map(svc => (
          <ServiceCard
            key={svc.id}
            service={svc}
            connected={!!settings[svc.settingsKey]}
            maskedToken={settings[svc.settingsKey]}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            health={serviceHealth[svc.envKey]}
          />
        ))}
      </div>
    </div>
  );
}

// ── Organizations Manager (Settings sub-panel) ─────────────────────────────
const ORG_TYPE_META = {
  company: { label: "Companies", color: "#4F8EF7" },
  lab: { label: "AI Labs", color: "#8B5CF6" },
  university: { label: "Universities", color: "#10B981" },
  other: { label: "Other", color: "#6B7280" },
};

// Favicon helper: extracts domain from org URL and returns a Google favicon URL
function orgFaviconUrl(org) {
  if (!org.url) return null;
  try {
    const domain = new URL(org.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return null; }
}

// Org icon component: shows favicon with fallback to colored initial
function OrgIcon({ org, color, size = 30 }) {
  const [imgError, setImgError] = useState(false);
  const faviconUrl = orgFaviconUrl(org);

  return (
    <div style={{ width: size, height: size, borderRadius: 6, background: "var(--bg-input)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
      {faviconUrl && !imgError ? (
        <img src={faviconUrl} width={size - 8} height={size - 8} alt="" onError={() => setImgError(true)} style={{ borderRadius: 2 }} />
      ) : (
        <span style={{ color, fontSize: size * 0.45, fontWeight: 700, fontFamily: mono }}>{org.label.charAt(0)}</span>
      )}
    </div>
  );
}

const BUILTIN_IDS = new Set(["google","openai","anthropic","meta","microsoft","apple","amazon","nvidia","xai","mistral","cohere","huggingface","baidu","tencent","alibaba","bytedance","samsung","intel","ibm","salesforce","stanford","mit","cmu","berkeley","harvard","princeton","oxford","cambridge","eth","tsinghua","peking","toronto","mila","ai2"]);

function OrgManager({ orgs, onUpdate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("company");
  const [newUrl, setNewUrl] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [confirmRescan, setConfirmRescan] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // { company: true, ... }

  const lbl = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };
  const hint = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };
  const inp = { padding: "6px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-primary)", fontSize: 12, fontFamily: sans, outline: "none", width: "100%" };
  const btnBase = { padding: "5px 12px", borderRadius: 5, fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600 };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    const id = newLabel.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const aliases = newAliases.split(",").map(a => a.trim()).filter(Boolean);
    const url = newUrl.trim() || undefined;
    try {
      const r = await api.addOrg({ id, label: newLabel.trim(), type: newType, url, aliases });
      if (r.added) {
        setLastAdded(newLabel.trim());
        setNewLabel(""); setNewUrl(""); setNewAliases(""); setShowAdd(false);
        setConfirmRescan(true);
        onUpdate();
      }
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  const handleDelete = async (orgId) => {
    setConfirmDelete(null);
    try { await api.removeOrg(orgId); onUpdate(); } catch (e) { console.error(e); }
  };

  const handleToggleActive = async (orgId, active) => {
    try { await api.updateOrg(orgId, { active }); onUpdate(); } catch (e) { console.error(e); }
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

  // Group orgs by type
  const groups = {};
  for (const o of orgs) {
    const t = o.type || "other";
    if (!groups[t]) groups[t] = [];
    groups[t].push(o);
  }
  const groupOrder = ["company", "lab", "university", "other"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600 }}>Organizations</div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>
      <div style={hint}>During scoring, the AI identifies author affiliations with these organizations and references to their products or technologies.</div>

      {/* Add new org form */}
      {showAdd && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>NAME</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Stability AI" style={inp} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>TYPE</label>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inp, cursor: "pointer", appearance: "auto" }}>
              {groupOrder.map(t => <option key={t} value={t}>{ORG_TYPE_META[t]?.label || t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>WEBSITE URL (for logo)</label>
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="e.g. https://stability.ai" style={inp} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>ALIASES (comma-separated, optional)</label>
            <input value={newAliases} onChange={e => setNewAliases(e.target.value)} placeholder="e.g. Stability, SDXL Team" style={inp} />
          </div>
          <button onClick={handleAdd} disabled={adding || !newLabel.trim()}
            style={{ ...btnBase, background: newLabel.trim() ? "var(--accent)" : "var(--bg-input)", border: "none", color: newLabel.trim() ? "white" : "var(--text-disabled)" }}>
            {adding ? "Adding..." : "Add Organization"}
          </button>
        </div>
      )}

      {/* Rescan prompt */}
      {confirmRescan && (
        <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--accent-bg-subtle, rgba(79,142,247,0.06))", border: "1px solid var(--accent)", borderRadius: 6 }}>
          <div style={{ color: "var(--text-primary)", fontSize: 11, marginBottom: 6 }}>Added <strong>{lastAdded}</strong>. Scan existing items?</div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 8 }}>Re-scores all items to detect affiliations with the new organization. May take several minutes.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleRescan} style={{ ...btnBase, background: "var(--accent)", border: "none", color: "white" }}>Scan now</button>
            <button onClick={() => setConfirmRescan(false)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Skip</button>
          </div>
        </div>
      )}
      {scanning && <div style={{ marginTop: 6, color: "var(--accent)", fontSize: 10, fontFamily: mono }}>Scanning items...</div>}
      {scanResult && <div style={{ marginTop: 6, color: "#10B981", fontSize: 10, fontFamily: mono }}>{scanResult}</div>}

      {/* Delete confirmation */}
      {confirmDelete && (() => {
        const org = orgs.find(o => o.id === confirmDelete);
        const isBuiltin = BUILTIN_IDS.has(confirmDelete);
        return (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid #EF444440", borderRadius: 6 }}>
            <div style={{ color: "var(--text-primary)", fontSize: 11, marginBottom: 6 }}>
              {isBuiltin ? <>Deactivate <strong>{org?.label}</strong>?</> : <>Delete <strong>{org?.label}</strong>?</>}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 8 }}>
              {isBuiltin
                ? "This is a built-in organization. It will be deactivated and hidden from scoring and filters, but can be reactivated later."
                : "This will permanently remove the organization. It will no longer be detected during scoring. Existing affiliation tags on items will remain until the next rescore."}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {isBuiltin ? (
                <button onClick={() => { handleToggleActive(confirmDelete, false); setConfirmDelete(null); }} style={{ ...btnBase, background: "#F59E0B", border: "none", color: "white" }}>Deactivate</button>
              ) : (
                <button onClick={() => handleDelete(confirmDelete)} style={{ ...btnBase, background: "#EF4444", border: "none", color: "white" }}>Delete</button>
              )}
              <button onClick={() => setConfirmDelete(null)} style={{ ...btnBase, background: "none", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Cancel</button>
            </div>
          </div>
        );
      })()}

      {/* Org list — grouped by type, collapsible */}
      <div style={{ marginTop: 10, maxHeight: 400, overflow: "auto" }}>
        {groupOrder.filter(t => groups[t]?.length > 0).map(type => {
          const meta = ORG_TYPE_META[type] || ORG_TYPE_META.other;
          const isCollapsed = collapsed[type];
          return (
            <div key={type} style={{ marginBottom: 8 }}>
              <button onClick={() => setCollapsed(c => ({ ...c, [type]: !c[type] }))}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: meta.color, fontSize: 10, fontFamily: mono, fontWeight: 600 }}>{isCollapsed ? "▸" : "▾"}</span>
                <span style={{ color: meta.color, fontSize: 11, fontFamily: mono, fontWeight: 600 }}>{meta.label}</span>
                <span style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono }}>{groups[type].length}</span>
              </button>
              {!isCollapsed && groups[type].map(o => (
                <div key={o.id} style={{ padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 4, display: "flex", alignItems: "center", gap: 10, opacity: o.active === false ? 0.5 : 1 }}>
                  <OrgIcon org={o} color={meta.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 500, fontFamily: sans }}>{o.label}</div>
                    {o.aliases?.length > 0 && <div style={{ color: "var(--text-faint)", fontSize: 9, fontFamily: mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.aliases.join(", ")}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <button onClick={() => handleToggleActive(o.id, !o.active)} title={o.active !== false ? "Deactivate" : "Activate"}
                      style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${o.active !== false ? "var(--border)" : "var(--accent)"}`, borderRadius: 4, color: o.active !== false ? "var(--text-faint)" : "var(--accent)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>
                      {o.active !== false ? "On" : "Off"}
                    </button>
                    <button onClick={() => setConfirmDelete(o.id)} title="Delete organization"
                      style={{ padding: "3px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-faint)", fontSize: 11, cursor: "pointer", lineHeight: 1 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Embedding / Clustering Status + Controls ─────────────────────────────────
function EmbeddingStatus() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let stopped = false;
    let failures = 0;
    const fetchStatus = () => {
      api.getEmbeddingStatus().then(s => {
        if (stopped) return;
        failures = 0;
        setStatus(s);
        if (s.ready || (s.error && !s.loading)) clearInterval(interval);
      }).catch(() => {
        if (stopped) return;
        failures++;
        // Only show error after several consecutive failures (server may still be starting)
        if (failures >= 4) {
          setStatus({ error: "Could not reach embedding service" });
          clearInterval(interval);
        }
      });
    };
    fetchStatus();
    api.getSettings().then(s => setSettings({
      enabled: s.dedupEnabled !== false,
      threshold: s.dedupThreshold || 0.75,
      windowDays: s.dedupWindowDays || 7,
    })).catch(() => {});
    const interval = setInterval(fetchStatus, 5000);
    return () => { stopped = true; clearInterval(interval); };
  }, []);

  const saveSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    const envKey = key === "enabled" ? "DEDUP_ENABLED" : key === "threshold" ? "DEDUP_THRESHOLD" : "DEDUP_WINDOW_DAYS";
    api.saveSettings({ [envKey]: String(value) }).catch(console.error);
  };

  if (!status && !settings) return null;
  const s = settings || { enabled: true, threshold: 0.75, windowDays: 7 };

  const hintStyle = { color: "var(--text-muted)", fontSize: 10, marginTop: 3, lineHeight: 1.4 };
  const label = { color: "var(--text-faint)", fontSize: 9, fontFamily: mono, fontWeight: 600, marginBottom: 4, display: "block", letterSpacing: "0.05em" };

  const sensitivityLabels = { 0.60: "Very broad", 0.67: "Broad", 0.75: "Default", 0.82: "Strict", 0.90: "Very strict" };
  const closestLabel = Object.entries(sensitivityLabels).reduce((best, [k, v]) =>
    Math.abs(k - s.threshold) < Math.abs(best[0] - s.threshold) ? [k, v] : best, [0.75, "Default"])[1];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600 }}>Deduplication</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: mono }}>{s.enabled ? "On" : "Off"}</span>
          <input type="checkbox" checked={s.enabled} onChange={e => saveSetting("enabled", e.target.checked)}
            style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }} />
        </label>
      </div>
      <div style={hintStyle}>Items covering the same story across multiple sources are grouped together, showing the most relevant version with links to the others.</div>

      {/* Model status */}
      {(() => {
        const notInstalled = status?.error?.includes("Cannot find package");
        const dotColor = !status ? "var(--text-faint)" : status.ready ? "#10B981" : status.loading ? "var(--accent)" : notInstalled ? "var(--text-faint)" : status.error ? "#EF4444" : "var(--text-faint)";
        return (
          <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--bg-elevated)", borderRadius: 5, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor, animation: (!status || status.loading) ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ color: "var(--text-secondary)", fontSize: 10, fontFamily: mono }}>
              {!status ? "Checking embedding model..."
                : status.ready ? "Embedding model ready"
                : status.loading ? `Downloading embedding model${status.progress?.progress ? ` (${status.progress.progress}%)` : "..."}`
                : notInstalled ? "Embedding model not available in this environment"
                : status.error ? "Embedding model unavailable"
                : "Waiting for embedding model..."}
            </span>
            {status?.error && !notInstalled && <span style={{ color: "#EF4444", fontSize: 9, fontFamily: mono, marginLeft: 4 }}>— {status.error}</span>}
          </div>
        );
      })()}

      {/* Controls — only show when enabled */}
      {s.enabled && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={label}>SENSITIVITY — {closestLabel}</label>
            <div style={{ padding: "0 4px" }}>
              <input type="range" min="0.60" max="0.90" step="0.02" value={s.threshold}
                onChange={e => saveSetting("threshold", parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-faint)", fontSize: 8, fontFamily: mono }}>
                <span>Broad</span><span>Strict</span>
              </div>
            </div>
          </div>
          <div>
            <label style={label}>TIME WINDOW</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[3, 7, 14, 30].map(d => (
                <button key={d} onClick={() => saveSetting("windowDays", d)} style={{
                  padding: "3px 10px", borderRadius: 4, fontSize: 10, fontFamily: mono, cursor: "pointer",
                  background: s.windowDays === d ? "var(--accent-bg)" : "var(--bg-input)",
                  border: `1px solid ${s.windowDays === d ? "var(--accent)" : "var(--border)"}`,
                  color: s.windowDays === d ? "var(--accent)" : "var(--text-muted)", fontWeight: s.windowDays === d ? 600 : 400,
                }}>{d}d</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Advanced Settings Sub-panel ─────────────────────────────────────────────
function AdvancedSection({ llmProvider }) {
  const isLocal = llmProvider === "ollama";
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

  const [rescoreProgress, setRescoreProgress] = useState(null); // { pct, message, eta }
  const [rescoreEvtSource, setRescoreEvtSource] = useState(null);

  const handleRescore = async () => {
    setConfirm(null);
    setRunning("rescore");
    setResult(null);
    setRescoreProgress({ pct: 0, message: "Starting..." });
    try {
      const evtSource = new EventSource("/api/admin/rescore/stream");
      setRescoreEvtSource(evtSource);
      evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setRescoreProgress({ pct: data.pct || 0, message: data.message, eta: data.eta });
        if (data.step === "done" || data.step === "cancelled") {
          evtSource.close();
          setRescoreEvtSource(null);
          setResult({ message: data.message, type: data.step === "done" ? "ok" : "ok" });
          setRunning(null);
          setRescoreProgress(null);
        } else if (data.step === "error") {
          evtSource.close();
          setRescoreEvtSource(null);
          setResult({ message: data.message, type: "error" });
          setRunning(null);
          setRescoreProgress(null);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setRescoreEvtSource(null);
        setResult({ message: "Connection lost during rescore", type: "error" });
        setRunning(null);
        setRescoreProgress(null);
      };
    } catch (e) {
      setResult({ message: e.message, type: "error" });
      setRunning(null);
      setRescoreProgress(null);
    }
  };

  const handleCancelRescore = () => {
    fetch("/api/admin/rescore/cancel", { method: "POST" }).catch(() => {});
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
        {rescoreProgress && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${rescoreProgress.pct}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: mono }}>{rescoreProgress.message}</span>
              <button onClick={handleCancelRescore} style={{ padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-faint)", fontSize: 9, fontFamily: mono, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}
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
              ? (isLocal
                ? "This will reset all relevance scores, affiliations, and tags, then re-run LLM scoring locally. This may take several minutes and is CPU-intensive — consider plugging in your computer if on battery."
                : "This will reset all relevance scores, affiliations, and tags, then re-run LLM scoring. This may take several minutes and will use API credits.")
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

// ── Collapsible Section Wrapper ──────────────────────────────────────────────
function SettingsSection({ id, title, subtitle, defaultOpen = true, children }) {
  const storageKey = `settings-section-${id}`;
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? saved === "1" : defaultOpen;
  });
  const toggle = () => setOpen(prev => { const next = !prev; localStorage.setItem(storageKey, next ? "1" : "0"); return next; });
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <button onClick={toggle} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
      }}>
        <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: mono, fontWeight: 600 }}>
          {open ? "▾" : "▸"} {title}
        </span>
        {subtitle && <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, fontWeight: 400 }}>{subtitle}</span>}
      </button>
      {open && <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>}
    </div>
  );
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ onClose, themeMode, setThemeMode }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [ollamaModels, setOllamaModels] = useState([]);
  const [testResult, setTestResult] = useState({}); // { scoring: { ok, ms, error }, analysis: { ... } }
  const [ollamaError, setOllamaError] = useState(null);
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(console.error);
    api.getSettings().then(s => {
      setSettings(s);
      setForm({
        llmProvider: s.llmProvider || "anthropic",
        llmModel: s.llmModel || "",
        analysisProvider: s.analysisProvider || "",
        analysisModel: s.analysisModel || "",
        anthropicKey: "",
        openaiKey: "",
        geminiKey: "",
        ollamaUrl: s.ollamaBaseUrl || "http://localhost:11434",
        relevanceContext: s.relevanceContext || "",
        scoringInstructions: s.scoringInstructions || "",
        refreshInterval: s.refreshInterval || "30",
      });
      // If Ollama is selected for either role, fetch models
      if ((s.llmProvider || "anthropic") === "ollama" || s.analysisProvider === "ollama") {
        fetchOllamaModels();
      }
    }).catch(console.error);
  }, []);

  const fetchOllamaModels = () => {
    setOllamaError(null);
    api.getOllamaModels().then(r => {
      if (r.error) { setOllamaError(r.error); return; }
      const models = r.models || [];
      setOllamaModels(models);
      // Sync form if an Ollama model field is empty but models are now available
      if (models.length > 0) {
        setForm(f => {
          const updates = {};
          if (f.llmProvider === "ollama" && !f.llmModel) updates.llmModel = models[0];
          if (f.analysisProvider === "ollama" && !f.analysisModel) updates.analysisModel = models[0];
          return Object.keys(updates).length > 0 ? { ...f, ...updates } : f;
        });
      }
    }).catch(e => setOllamaError(e.message));
  };

  // Remember last-selected model per provider so switching back restores it
  const [lastModel, setLastModel] = useState({});
  const [lastAnalysisModel, setLastAnalysisModel] = useState({});

  const handleProviderChange = (providerId) => {
    const provider = LLM_PROVIDERS.find(p => p.id === providerId);
    const models = providerId === "ollama" ? ollamaModels : (provider?.models || []);
    setForm(f => {
      // Stash current selection before switching
      setLastModel(prev => ({ ...prev, [f.llmProvider]: f.llmModel }));
      const restored = lastModel[providerId];
      return { ...f, llmProvider: providerId, llmModel: restored || models[0] || "" };
    });
    if (providerId === "ollama") fetchOllamaModels();
  };

  const handleAnalysisProviderChange = (providerId) => {
    const provider = LLM_PROVIDERS.find(p => p.id === providerId);
    const models = providerId === "ollama" ? ollamaModels : (provider?.models || []);
    setForm(f => {
      setLastAnalysisModel(prev => ({ ...prev, [f.analysisProvider]: f.analysisModel }));
      const restored = lastAnalysisModel[providerId];
      return { ...f, analysisProvider: providerId, analysisModel: restored || models[0] || "" };
    });
    if (providerId === "ollama") fetchOllamaModels();
  };

  const handleTestModel = async (role) => {
    const provider = role === "analysis" ? (form.analysisProvider || form.llmProvider) : form.llmProvider;
    const model = role === "analysis" ? (form.analysisModel || form.llmModel) : form.llmModel;
    if (!provider || !model) return;
    setTestResult(prev => ({ ...prev, [role]: { testing: true } }));
    try {
      const r = await api.testLLM(provider, model);
      setTestResult(prev => ({ ...prev, [role]: r }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [role]: { ok: false, error: e.message } }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = {};
    updates.LLM_PROVIDER = form.llmProvider;
    if (form.llmModel) updates.LLM_MODEL = form.llmModel;
    updates.LLM_ANALYSIS_PROVIDER = form.analysisProvider || "";
    updates.LLM_ANALYSIS_MODEL = form.analysisModel || "";
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

        {/* ── Section 1: Profile (always open) ── */}
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>Your Role</div>
          <label style={label}>RELEVANCE CONTEXT</label>
          <textarea value={form.relevanceContext} onChange={e => setForm(f => ({ ...f, relevanceContext: e.target.value }))} placeholder="Describe your role, responsibilities, and focus areas..." style={textarea} />
          <div style={hint}>This tells the LLM who you are so it can score items for your specific needs. Be specific about your role, industry, and focus areas.</div>
        </div>

        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 10 }}>Scoring Instructions</div>
          <label style={label}>PRIORITIZATION & FILTERING</label>
          <textarea value={form.scoringInstructions} onChange={e => setForm(f => ({ ...f, scoringInstructions: e.target.value }))} placeholder="E.g., Prioritize agentic AI and MCP protocol developments. Deprioritize general ML benchmarks. Flag anything related to EU AI Act..." style={textarea} />
          <div style={hint}>Additional instructions for how items should be scored, filtered, or recommended. These are appended to the scoring prompt.</div>
        </div>

        <div>
          <label style={label}>THEME</label>
          <ThemeToggle mode={themeMode} setMode={setThemeMode} />
        </div>

        {/* ── Section 2: AI Engine (collapsible) ── */}
        <SettingsSection id="ai-engine" title="AI Engine" subtitle="LLM, deduplication, refresh">

          {/* ── Scoring Model ── */}
          <div>
            <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 4 }}>Scoring Model</div>
            <div style={hint}>Used for scoring items, extracting affiliations, and feed health analysis.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10, marginBottom: 14 }}>
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

            {/* Model selector + test */}
            {(() => {
              const provider = LLM_PROVIDERS.find(p => p.id === form.llmProvider);
              if (!provider) return null;
              const models = form.llmProvider === "ollama" ? ollamaModels : provider.models;
              const t = testResult.scoring;
              return (
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>MODEL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {models.length > 0 ? (
                      <select value={form.llmModel} onChange={e => { setForm(f => ({ ...f, llmModel: e.target.value })); setTestResult(r => ({ ...r, scoring: undefined })); }}
                        style={{ ...inp, cursor: "pointer", appearance: "auto", flex: 1 }}>
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={form.llmModel} onChange={e => { setForm(f => ({ ...f, llmModel: e.target.value })); setTestResult(r => ({ ...r, scoring: undefined })); }}
                        placeholder={form.llmProvider === "ollama" ? "e.g. llama3.2, mistral, gemma2" : "model name"}
                        style={{ ...inp, flex: 1 }} />
                    )}
                    <button onClick={() => handleTestModel("scoring")} disabled={!form.llmModel}
                      style={{ padding: "8px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 11, fontFamily: mono, cursor: "pointer", whiteSpace: "nowrap", opacity: !form.llmModel ? 0.5 : 1 }}>
                      {t?.testing ? "Testing..." : "Test"}
                    </button>
                  </div>
                  {t && !t.testing && (
                    <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 5, fontSize: 10, fontFamily: mono, display: "flex", alignItems: "center", gap: 6, background: t.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ok ? "#10B981" : "#EF4444", flexShrink: 0 }} />
                      <span style={{ color: t.ok ? "#10B981" : "#EF4444" }}>
                        {t.ok ? `OK — ${t.ms}ms` : t.error}
                      </span>
                    </div>
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

            {/* Provider-specific auth — shown for whichever providers are in use */}
            {(() => {
              // Collect unique providers that need API key inputs
              const activeProviderIds = new Set([form.llmProvider]);
              if (form.analysisProvider && form.analysisProvider !== form.llmProvider) activeProviderIds.add(form.analysisProvider);
              const authSections = [];

              for (const pid of activeProviderIds) {
                const provider = LLM_PROVIDERS.find(p => p.id === pid);
                if (!provider || provider.authType !== "apiKey") continue;

                const formKey = pid === "anthropic" ? "anthropicKey" : pid === "openai" ? "openaiKey" : "geminiKey";
                const hasKey = pid === "anthropic" ? settings.hasApiKey : pid === "openai" ? settings.hasOpenaiKey : settings.hasGeminiKey;
                const maskedKey = pid === "anthropic" ? settings.anthropicApiKey : pid === "openai" ? settings.openaiApiKey : settings.geminiApiKey;
                authSections.push(
                  <div key={pid}>
                    <label style={label}>{provider.name.toUpperCase()} API KEY {hasKey && <span style={{ color: "#10B981" }}>(configured)</span>}</label>
                    <input type="password" value={form[formKey]}
                      onChange={e => setForm(f => ({ ...f, [formKey]: e.target.value }))}
                      placeholder={hasKey ? maskedKey : provider.keyPlaceholder} style={inp} />
                    <div style={hint}>Leave blank to keep current key.</div>
                  </div>
                );
              }

              // Ollama URL — only when Ollama is selected as either provider
              if (activeProviderIds.has("ollama")) {
                authSections.push(
                  <div key="ollama">
                    <label style={label}>OLLAMA SERVER URL</label>
                    <input value={form.ollamaUrl}
                      onChange={e => setForm(f => ({ ...f, ollamaUrl: e.target.value }))}
                      placeholder="http://localhost:11434" style={inp} />
                    <div style={hint}>Ollama runs locally — no API key needed. Install from ollama.com.</div>
                  </div>
                );
              }

              return authSections.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{authSections}</div> : null;
            })()}
          </div>

          {/* ── Analysis Model ── */}
          <div>
            <div style={{ color: "var(--text-primary)", fontSize: 12, fontFamily: mono, fontWeight: 600, marginBottom: 4 }}>Analysis Model</div>
            <div style={hint}>Used for Intel Brief and Coverage Analysis. Defaults to the scoring model when set to "Same".</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10, marginBottom: 14 }}>
              {/* "Same as scoring" option */}
              <button onClick={() => setForm(f => ({ ...f, analysisProvider: "", analysisModel: "" }))} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "12px 8px", borderRadius: 8, cursor: "pointer",
                background: !form.analysisProvider ? "var(--accent-bg)" : "var(--bg-input)",
                border: !form.analysisProvider ? "2px solid var(--accent)" : "2px solid var(--border)",
                transition: "all 0.15s ease",
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>=</span>
                <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 600, color: !form.analysisProvider ? "var(--accent)" : "var(--text-muted)" }}>Same</span>
              </button>
              {LLM_PROVIDERS.map(p => {
                const selected = form.analysisProvider === p.id;
                return (
                  <button key={p.id} onClick={() => handleAnalysisProviderChange(p.id)} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: "12px 8px", borderRadius: 8, cursor: "pointer",
                    background: selected ? "var(--accent-bg)" : "var(--bg-input)",
                    border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                    transition: "all 0.15s ease",
                  }}>
                    <p.logo size={28} color={selected ? "var(--accent)" : "var(--text-muted)"} />
                    <span style={{ fontSize: 10, fontFamily: mono, fontWeight: 600, color: selected ? "var(--accent)" : "var(--text-muted)" }}>{p.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Analysis model selector + test */}
            {(() => {
              // When "Same" is selected, show the effective model with a test button
              const effectiveProvider = form.analysisProvider || form.llmProvider;
              const effectiveModel = form.analysisProvider ? form.analysisModel : form.llmModel;
              const provider = LLM_PROVIDERS.find(p => p.id === effectiveProvider);
              if (!provider) return null;
              const models = effectiveProvider === "ollama" ? ollamaModels : provider.models;
              const t = testResult.analysis;

              if (!form.analysisProvider) {
                // "Same" mode — just show test button with effective model label
                return (
                  <div>
                    <label style={label}>MODEL</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: mono, flex: 1 }}>{effectiveModel || "—"}</span>
                      <button onClick={() => handleTestModel("analysis")} disabled={!effectiveModel}
                        style={{ padding: "8px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 11, fontFamily: mono, cursor: "pointer", whiteSpace: "nowrap", opacity: !effectiveModel ? 0.5 : 1 }}>
                        {t?.testing ? "Testing..." : "Test"}
                      </button>
                    </div>
                    {t && !t.testing && (
                      <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 5, fontSize: 10, fontFamily: mono, display: "flex", alignItems: "center", gap: 6, background: t.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ok ? "#10B981" : "#EF4444", flexShrink: 0 }} />
                        <span style={{ color: t.ok ? "#10B981" : "#EF4444" }}>{t.ok ? `OK — ${t.ms}ms` : t.error}</span>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div>
                  <label style={label}>MODEL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {models.length > 0 ? (
                      <select value={form.analysisModel} onChange={e => { setForm(f => ({ ...f, analysisModel: e.target.value })); setTestResult(r => ({ ...r, analysis: undefined })); }}
                        style={{ ...inp, cursor: "pointer", appearance: "auto", flex: 1 }}>
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={form.analysisModel} onChange={e => { setForm(f => ({ ...f, analysisModel: e.target.value })); setTestResult(r => ({ ...r, analysis: undefined })); }}
                        placeholder={form.analysisProvider === "ollama" ? "e.g. llama3.2, mistral, gemma2" : "model name"}
                        style={{ ...inp, flex: 1 }} />
                    )}
                    <button onClick={() => handleTestModel("analysis")} disabled={!form.analysisModel}
                      style={{ padding: "8px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 11, fontFamily: mono, cursor: "pointer", whiteSpace: "nowrap", opacity: !form.analysisModel ? 0.5 : 1 }}>
                      {t?.testing ? "Testing..." : "Test"}
                    </button>
                  </div>
                  {t && !t.testing && (
                    <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 5, fontSize: 10, fontFamily: mono, display: "flex", alignItems: "center", gap: 6, background: t.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.ok ? "#10B981" : "#EF4444", flexShrink: 0 }} />
                      <span style={{ color: t.ok ? "#10B981" : "#EF4444" }}>{t.ok ? `OK — ${t.ms}ms` : t.error}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <EmbeddingStatus />

          <div>
            <label style={label}>SOURCE REFRESH INTERVAL (MINUTES)</label>
            <input type="number" min="5" max="1440" value={form.refreshInterval} onChange={e => setForm(f => ({ ...f, refreshInterval: e.target.value }))} style={{ ...inp, width: 120 }} />
          </div>
        </SettingsSection>

        {/* ── Section 3: Organizations (collapsible) ── */}
        <SettingsSection id="organizations" title="Organizations" subtitle="tracked entities">
          <OrgManager orgs={orgs} onUpdate={() => api.getOrgs().then(setOrgs).catch(console.error)} />
        </SettingsSection>

        {/* ── Section 4: Connections (collapsible) ── */}
        <SettingsSection id="connections" title="Connections" subtitle="services and tools">
          <ConnectedServicesSection settings={settings} onConnect={handleServiceConnect} onDisconnect={handleServiceDisconnect} />
          <AdvancedSection llmProvider={form.llmProvider} />
        </SettingsSection>
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



export default SettingsPanel;
