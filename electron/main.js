// Set ELECTRON_MODE before any backend imports to prevent auto-start
process.env.ELECTRON_MODE = "1";

import { app, BrowserWindow, shell, Menu, dialog, powerMonitor, ipcMain, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.NODE_ENV === "development";

let mainWindow = null;
let serverInstance = null;

// Set userData path for all persistent data
const userDataPath = app.getPath("userData");
process.env.DATA_DIR = path.join(userDataPath, "data");
process.env.NODE_ENV = IS_DEV ? "development" : "production";

// Load settings from config file (API key, relevance context, etc.)
import fs from "fs";
const SETTINGS_FILE = path.join(userDataPath, "settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("[Electron] Failed to load settings:", e.message);
  }
  return {};
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Apply saved settings to environment, seeding from .env on first launch
const settings = loadSettings();
const isFirstLaunch = Object.keys(settings).length === 0;

if (isFirstLaunch) {
  // Seed from .env if it exists alongside the source (dev) or in common locations
  const envPaths = [
    path.join(__dirname, "..", "backend", ".env"),
    path.join(__dirname, "..", ".env"),
  ];
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const parsed = {};
        for (const line of envContent.split("\n")) {
          const match = line.match(/^([A-Z_]+)\s*=\s*"?(.+?)"?\s*$/);
          if (match) parsed[match[1]] = match[2];
        }
        if (parsed.ANTHROPIC_API_KEY && parsed.ANTHROPIC_API_KEY !== "sk-ant-your-key-here") {
          settings.ANTHROPIC_API_KEY = parsed.ANTHROPIC_API_KEY;
        }
        if (parsed.RELEVANCE_CONTEXT) settings.RELEVANCE_CONTEXT = parsed.RELEVANCE_CONTEXT;
        if (parsed.FEED_REFRESH_INTERVAL) settings.FEED_REFRESH_INTERVAL = parsed.FEED_REFRESH_INTERVAL;
        saveSettings(settings);
        console.log(`[Electron] Seeded settings from ${envPath}`);
        break;
      }
    } catch { /* ignore */ }
  }
}

const ALL_SETTINGS_KEYS = [
  "ANTHROPIC_API_KEY", "RELEVANCE_CONTEXT", "SCORING_INSTRUCTIONS",
  "FEED_REFRESH_INTERVAL", "SUBSTACK_SESSION", "TWITTER_SESSION",
  "LINKEDIN_SESSION", "THREADS_SESSION", "YOUTUBE_SESSION",
];
for (const key of ALL_SETTINGS_KEYS) {
  if (settings[key]) process.env[key] = settings[key];
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AI Intelligence Hub",
    backgroundColor: "#0A0E14",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = IS_DEV
    ? "http://localhost:5173"
    : `http://localhost:${port}`;

  mainWindow.loadURL(url);

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu(port) {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => showSettingsDialog(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showSettingsDialog() {
  // Open the in-app settings panel via the renderer
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("open-settings"))'
    );
  }
}

// ── Service authentication flows ─────────────────────────────────────────────
// All services use browser login + cookie capture. The user signs into the
// service normally in a popup window; we detect the session cookie and store it.

// Helper: save a token via the backend settings API
async function saveServiceToken(envKey, token) {
  const port = serverInstance?.address?.()?.port;
  if (!port) return;
  await fetch(`http://localhost:${port}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [envKey]: token }),
  });
}

// Service definitions: login URL, cookie to capture, and where to store it.
// Add new services here — the generic captureCookie() handles the flow.
const SERVICE_AUTH = {
  twitter: {
    title: "Sign in to X / Twitter",
    loginUrl: "https://x.com/i/flow/login",
    domain: ".x.com",
    cookieName: "auth_token",
    envKey: "TWITTER_SESSION",
  },
  substack: {
    title: "Sign in to Substack",
    loginUrl: "https://substack.com/sign-in",
    domain: "substack.com",
    cookieName: "substack.sid",
    envKey: "SUBSTACK_SESSION",
  },
  linkedin: {
    title: "Sign in to LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    domain: ".linkedin.com",
    cookieName: "li_at",
    envKey: "LINKEDIN_SESSION",
  },
  threads: {
    title: "Sign in to Threads",
    loginUrl: "https://www.threads.net/login",
    domain: ".threads.net",
    cookieName: "sessionid",
    envKey: "THREADS_SESSION",
    // Threads login redirects through Instagram — also check that domain
    altDomain: ".instagram.com",
    altCookieName: "sessionid",
  },
  youtube: {
    title: "Sign in to YouTube",
    loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/",
    domain: ".youtube.com",
    cookieName: "SID",
    envKey: "YOUTUBE_SESSION",
    // YouTube uses multiple cookies; capture the key ones as a JSON bundle
    captureMultiple: ["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID"],
  },
};

// ── Generic cookie capture flow ─────────────────────────────────────────────
function captureCookie(config) {
  return new Promise((resolve) => {
    const partition = `persist:auth-${config.envKey}`;
    const authSession = session.fromPartition(partition);

    const authWin = new BrowserWindow({
      parent: mainWindow,
      width: 520,
      height: 720,
      title: config.title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition,
      },
    });

    let resolved = false;

    const checkCookie = async () => {
      if (resolved) return;
      try {
        if (config.captureMultiple) {
          // Capture multiple cookies as a JSON bundle
          const allCookies = await authSession.cookies.get({ domain: config.domain });
          const found = {};
          for (const name of config.captureMultiple) {
            const c = allCookies.find(c => c.name === name);
            if (c) found[name] = c.value;
          }
          // Consider connected once we have at least the primary cookie
          if (found[config.cookieName]) {
            resolved = true;
            await saveServiceToken(config.envKey, JSON.stringify(found));
            authWin.close();
            resolve({ ok: true });
          }
        } else {
          // Single cookie capture
          let cookies = await authSession.cookies.get({ domain: config.domain, name: config.cookieName });
          // Check alternate domain (e.g., Threads via Instagram)
          if (cookies.length === 0 && config.altDomain) {
            cookies = await authSession.cookies.get({ domain: config.altDomain, name: config.altCookieName || config.cookieName });
          }
          if (cookies.length > 0) {
            resolved = true;
            await saveServiceToken(config.envKey, cookies[0].value);
            authWin.close();
            resolve({ ok: true });
          }
        }
      } catch { /* ignore */ }
    };

    authWin.webContents.on("did-navigate", checkCookie);
    authWin.webContents.on("did-navigate-in-page", checkCookie);
    const interval = setInterval(checkCookie, 2000);

    authWin.on("closed", () => {
      clearInterval(interval);
      if (!resolved) resolve({ ok: false, error: "Window closed before login completed" });
    });

    authWin.loadURL(config.loginUrl);
  });
}

// ── IPC handler for service connections ──────────────────────────────────────
ipcMain.handle("connect-service", async (event, serviceId) => {
  const config = SERVICE_AUTH[serviceId];
  if (!config) return { ok: false, error: `Unknown service: ${serviceId}` };
  console.log(`[Electron] Connecting service: ${serviceId}`);
  return captureCookie(config);
});

// Dynamic auth for paywalled feeds — opens the site, captures any session cookie
ipcMain.handle("connect-feed", async (event, { feedId, siteUrl, envKey }) => {
  let domain;
  try { domain = "." + new URL(siteUrl).hostname.replace(/^www\./, ""); } catch {
    return { ok: false, error: "Invalid URL" };
  }
  console.log(`[Electron] Feed auth: ${feedId} → ${siteUrl} (domain: ${domain})`);

  // Open login page and capture the most likely session cookie
  const SESSION_COOKIE_NAMES = ["session", "sessionid", "session_id", "sid", "auth_token", "token",
    "connect.sid", "substack.sid", "li_at", "__Secure-1PSID", "_session", "user_session"];

  const config = {
    title: `Sign in — ${domain.replace(/^\./, "")}`,
    loginUrl: siteUrl,
    domain,
    cookieName: null, // will check all candidates
    envKey: envKey || feedId.toUpperCase().replace(/-/g, "_") + "_SESSION",
  };

  return new Promise((resolve) => {
    const partition = `persist:auth-${config.envKey}`;
    const authSession = session.fromPartition(partition);

    const authWin = new BrowserWindow({
      parent: mainWindow, width: 520, height: 720, title: config.title,
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition },
    });

    let resolved = false;

    const checkCookie = async () => {
      if (resolved) return;
      try {
        const allCookies = await authSession.cookies.get({ domain: config.domain });
        // Look for any known session cookie name
        for (const name of SESSION_COOKIE_NAMES) {
          const c = allCookies.find(ck => ck.name === name);
          if (c) {
            resolved = true;
            await saveServiceToken(config.envKey, c.value);
            authWin.close();
            resolve({ ok: true, cookieName: name });
            return;
          }
        }
        // Fallback: if we find any cookie with "session" or "token" in the name
        const fallback = allCookies.find(c => /session|token|auth|sid/i.test(c.name) && c.value.length > 10);
        if (fallback) {
          resolved = true;
          await saveServiceToken(config.envKey, fallback.value);
          authWin.close();
          resolve({ ok: true, cookieName: fallback.name });
          return;
        }
      } catch { /* ignore */ }
    };

    authWin.webContents.on("did-navigate", checkCookie);
    authWin.webContents.on("did-navigate-in-page", checkCookie);
    const interval = setInterval(checkCookie, 2000);

    authWin.on("closed", () => {
      clearInterval(interval);
      if (!resolved) resolve({ ok: false, error: "Window closed before login completed" });
    });

    authWin.loadURL(config.loginUrl);
  });
});

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // Dynamically import the server (after ELECTRON_MODE is set)
    const { createServer } = await import("../backend/src/server.js");

    // Start the Express backend on a dynamic port
    const port = IS_DEV ? 3001 : 0; // 0 = random available port
    serverInstance = await createServer(port);
    const actualPort = serverInstance.address().port;

    console.log(`[Electron] Backend server running on port ${actualPort}`);

    buildMenu(actualPort);
    createWindow(actualPort);

  } catch (err) {
    console.error("[Electron] Failed to start:", err);
    dialog.showErrorBox("Startup Error", `Failed to start AI Intelligence Hub:\n\n${err.message}`);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && app.isReady() && serverInstance) {
    const port = serverInstance.address()?.port || 3001;
    createWindow(port);
  }
});

// Handle sleep/wake for cron scheduling
powerMonitor.on("resume", () => {
  console.log("[Electron] System resumed from sleep — triggering feed refresh");
  // The cron scheduler will continue on its own, but force an immediate refresh
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      'fetch("/api/fetch", {method:"POST"}).catch(()=>{})'
    );
  }
});

app.on("before-quit", () => {
  if (serverInstance) {
    serverInstance.close();
  }
});
