// Shared service definitions, icons, and components used by both SettingsPanel and SourcesPanel
import { useState } from "react";
import { api } from "../api.js";
import { mono, sans } from "../constants.js";

export const isElectron = !!(window.electronAPI?.isElectron);

// ── Service brand icons (inline SVG) ────────────────────────────────────────
const SvcIcon = ({ d, viewBox = "0 0 24 24", size = 16, color }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={color} xmlns="http://www.w3.org/2000/svg">
    <path d={d} />
  </svg>
);

export const SERVICE_ICONS = {
  twitter: (color) => <SvcIcon color={color} d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
  substack: (color) => <SvcIcon color={color} d="M22.539 8.242H1.46V5.406h21.08zM1.46 10.812V24L12 18.11 22.54 24V10.812zM22.54 0H1.46v2.836h21.08z" />,
  linkedin: (color) => <SvcIcon color={color} d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />,
  threads: (color) => <SvcIcon color={color} d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.265 1.33-3.084.857-.762 2.058-1.2 3.479-1.269 1.015-.05 1.96.026 2.836.194-.07-.81-.281-1.452-.635-1.924-.506-.672-1.281-1.018-2.303-1.028h-.06c-.774.005-1.758.264-2.353.754l-1.354-1.594C6.908 4.353 8.417 3.9 9.878 3.882h.088c1.595.017 2.856.598 3.742 1.724.783.996 1.208 2.322 1.263 3.94.544.127 1.05.296 1.514.506 1.14.516 2.084 1.29 2.728 2.238.88 1.296 1.07 2.878.547 4.574-.7 2.268-2.593 3.823-5.635 4.626-.892.236-1.883.378-2.967.442-.32.019-.643.03-.968.03l.004.038zM10.14 15.39c.017.305.17.6.43.827.37.318.9.482 1.437.453.907-.05 1.6-.36 2.06-.925.31-.382.555-.906.731-1.562-.66-.14-1.37-.2-2.108-.168-.97.046-1.683.313-2.12.793-.278.306-.419.65-.43.582z" />,
  youtube: (color) => <SvcIcon color={color} d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z" />,
};

export const SERVICES = [
  { id: "twitter", name: "X / Twitter", settingsKey: "twitterSession", envKey: "TWITTER_SESSION", description: "Access tweets and threads from tracked X accounts.", electronAuth: true, manualPlaceholder: "Paste auth_token cookie value...", manualHelpText: "In your browser: log in to x.com, then open DevTools (F12) > Application > Cookies > x.com and copy the 'auth_token' value." },
  { id: "substack", name: "Substack", settingsKey: "substackSession", envKey: "SUBSTACK_SESSION", description: "Access paywalled Substack posts you subscribe to.", electronAuth: true, manualPlaceholder: "Paste substack.sid cookie value...", manualHelpText: "In your browser: log in to Substack, then open DevTools (F12) > Application > Cookies > substack.com and copy the 'substack.sid' value." },
  { id: "linkedin", name: "LinkedIn", settingsKey: "linkedinSession", envKey: "LINKEDIN_SESSION", description: "Monitor posts from LinkedIn thought leaders.", electronAuth: true, manualPlaceholder: "Paste li_at cookie value...", manualHelpText: "In your browser: log in to LinkedIn, then open DevTools (F12) > Application > Cookies > linkedin.com and copy the 'li_at' value." },
  { id: "threads", name: "Threads", settingsKey: "threadsSession", envKey: "THREADS_SESSION", description: "Follow conversations on Threads by Meta.", electronAuth: true, manualPlaceholder: "Paste sessionid cookie value...", manualHelpText: "In your browser: log in to threads.net, then open DevTools (F12) > Application > Cookies > threads.net and copy the 'sessionid' value." },
  { id: "youtube", name: "YouTube", settingsKey: "youtubeSession", envKey: "YOUTUBE_SESSION", description: "Access subscriptions and channel content on YouTube.", electronAuth: true, manualPlaceholder: "Paste SID cookie value...", manualHelpText: "In your browser: log in to YouTube, then open DevTools (F12) > Application > Cookies > youtube.com and copy the 'SID' value." },
];

// ── Paywall Prompt (used in SourcesPanel feed detail) ────────────────────────
export function PaywallPrompt({ feed }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");

  let domain = "";
  let siteUrl = "";
  try { const u = new URL(feed.url); domain = u.hostname.replace(/^www\./, ""); siteUrl = u.origin; } catch { /* */ }
  const envKey = feed.id.toUpperCase().replace(/-/g, "_") + "_SESSION";

  const handleElectronAuth = async () => {
    setConnecting(true); setError(null);
    try {
      const result = await window.electronAPI.connectFeed({ feedId: feed.id, siteUrl, envKey });
      if (result.ok) { setDone(true); } else { setError(result.error || "Sign-in was not completed"); setShowManual(true); }
    } catch (e) { setError(e.message); setShowManual(true); }
    setConnecting(false);
  };

  const handleManualSave = async () => {
    if (!token.trim()) return;
    try { await api.saveSettings({ [envKey]: token.trim() }); setDone(true); setShowManual(false); } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ marginTop: 6, padding: "6px 10px", background: "#F59E0B10", border: "1px solid #F59E0B30", borderRadius: 5 }} onClick={e => e.stopPropagation()}>
      <div style={{ color: "#F59E0B", fontSize: 10, fontFamily: mono, fontWeight: 600, marginBottom: 3 }}>REQUIRES AUTHORIZATION</div>
      {done ? (
        <div style={{ color: "#10B981", fontSize: 10, fontFamily: mono }}>Authorized. Full content will be available on next refresh.</div>
      ) : (<>
        <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>This source requires a subscription or login to <strong>{domain}</strong>. Items may be missing or truncated.</div>
        {error && <div style={{ color: "#EF4444", fontSize: 10, fontFamily: mono, marginBottom: 6 }}>{error}</div>}
        {isElectron ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={handleElectronAuth} disabled={connecting} style={{ padding: "4px 12px", background: "var(--accent)", border: "none", borderRadius: 4, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600, opacity: connecting ? 0.6 : 1 }}>{connecting ? "Signing in..." : `Sign in to ${domain}`}</button>
          </div>
        ) : !showManual ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setShowManual(true)} style={{ padding: "4px 12px", background: "var(--accent)", border: "none", borderRadius: 4, color: "white", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Authorize Access</button>
          </div>
        ) : null}
        {showManual && (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4, marginBottom: 6 }}>Log in to {domain} in your browser, then paste your session token below.</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Session token..." style={{ flex: 1, padding: "5px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, fontFamily: mono, outline: "none" }} />
              <button onClick={handleManualSave} disabled={!token.trim()} style={{ padding: "4px 10px", background: token.trim() ? "var(--accent)" : "var(--bg-input)", border: "none", borderRadius: 4, color: token.trim() ? "white" : "var(--text-disabled)", fontSize: 9, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Save</button>
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}

// ── Service Connect Card ────────────────────────────────────────────────────
export function ServiceCard({ service, connected, maskedToken, onConnect, onDisconnect, health }) {
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const useNativeAuth = isElectron && service.electronAuth;
  const stale = connected && health && !health.ok;

  const handleNativeConnect = async () => {
    setConnecting(true); setError(null);
    try {
      const result = await window.electronAPI.connectService(service.id);
      if (result.ok) { onConnect(service, null); } else { setError(result.error || "Connection failed"); }
    } catch (e) { setError(e.message); }
    setConnecting(false);
  };

  const handleManualSave = () => { if (token.trim()) { onConnect(service, token.trim()); setToken(""); setShowManual(false); } };

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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {health === undefined ? <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>Checking...</span>
              : stale ? (<><span style={{ color: "#EF4444", fontSize: 10, fontFamily: mono }}>Session expired</span><button onClick={() => { setShowManual(true); }} style={{ padding: "4px 10px", background: "var(--accent)", border: "none", borderRadius: 5, color: "white", fontSize: 10, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Reconnect</button></>)
              : <span style={{ color: "#10B981", fontSize: 10, fontFamily: mono }}>Connected</span>}
            <button onClick={() => onDisconnect(service)} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", fontSize: 10, fontFamily: mono, cursor: "pointer" }}>Disconnect</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {useNativeAuth ? (
              <button onClick={handleNativeConnect} disabled={connecting} style={{ padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600, opacity: connecting ? 0.6 : 1 }}>{connecting ? "Connecting..." : `Sign in to ${service.name}`}</button>
            ) : (
              <button onClick={() => setShowManual(!showManual)} style={{ padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: 6, color: "white", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Connect</button>
            )}
          </div>
        )}
      </div>
      {error && <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--error-bg)", borderRadius: 5, color: "#EF4444", fontSize: 11, fontFamily: mono }}>{error}</div>}
      {((!connected && (showManual || (useNativeAuth && error))) || (stale && showManual)) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
            {useNativeAuth && error ? "Sign-in didn't work? You can paste the token manually:" : service.manualHelpText}
            {service.manualHelpUrl && <> <a href={service.manualHelpUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Open portal &rarr;</a></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={service.manualPlaceholder}
              style={{ padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, fontFamily: mono, outline: "none", flex: 1 }}
              onKeyDown={e => e.key === "Enter" && handleManualSave()} />
            <button onClick={handleManualSave} disabled={!token.trim()} style={{ padding: "7px 14px", background: token.trim() ? "var(--accent)" : "var(--bg-input)", border: `1px solid ${token.trim() ? "var(--accent)" : "var(--border)"}`, borderRadius: 6, color: token.trim() ? "white" : "var(--text-disabled)", fontSize: 11, fontFamily: mono, cursor: "pointer", fontWeight: 600 }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
