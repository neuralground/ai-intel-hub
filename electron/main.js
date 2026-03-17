// Set ELECTRON_MODE before any backend imports to prevent auto-start
process.env.ELECTRON_MODE = "1";

import { app, BrowserWindow, shell, Menu, dialog, powerMonitor, ipcMain, session } from "electron";
import crypto from "crypto";
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
  "FEED_REFRESH_INTERVAL", "SUBSTACK_SESSION", "TWITTER_BEARER_TOKEN", "LINKEDIN_SESSION",
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

// ── Twitter/X: OAuth 2.0 PKCE ──────────────────────────────────────────────
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function connectTwitter() {
  // Read client ID from settings (user must configure this)
  const currentSettings = loadSettings();
  const clientId = currentSettings.TWITTER_CLIENT_ID;

  if (!clientId) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Twitter/X Setup Required",
      message: "X Developer App Required",
      detail: [
        "To connect X/Twitter, you need an X Developer account with a registered app.",
        "",
        "1. Go to developer.x.com and create a project/app",
        "2. Set the callback URL to: http://localhost/callback",
        "3. Copy the Client ID",
        "4. Enter it in the dialog that follows",
        "",
        "Note: Reading tweets requires X API Basic tier ($200/mo).",
      ].join("\n"),
      buttons: ["Enter Client ID", "Cancel"],
    });

    if (response === 1) return { ok: false, error: "Cancelled" };

    // Prompt for client ID using a small input window
    const id = await promptInput("X/Twitter Client ID", "Paste your OAuth 2.0 Client ID:");
    if (!id) return { ok: false, error: "No Client ID provided" };

    currentSettings.TWITTER_CLIENT_ID = id;
    saveSettings(currentSettings);
    return connectTwitter(); // Retry with the client ID now saved
  }

  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = "http://localhost/callback";
  const scopes = "tweet.read users.read offline.access";

  const authUrl = new URL("https://x.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      parent: mainWindow,
      width: 600,
      height: 700,
      title: "Sign in to X / Twitter",
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    authWin.webContents.on("will-redirect", async (event, url) => {
      if (!url.startsWith(redirectUri)) return;
      event.preventDefault();

      const params = new URL(url).searchParams;
      const code = params.get("code");
      const returnedState = params.get("state");

      if (returnedState !== state || !code) {
        authWin.close();
        return resolve({ ok: false, error: "OAuth state mismatch or no code" });
      }

      // Exchange code for token
      try {
        const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            grant_type: "authorization_code",
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          }),
        });

        const tokenData = await tokenRes.json();
        authWin.close();

        if (tokenData.access_token) {
          await saveServiceToken("TWITTER_BEARER_TOKEN", tokenData.access_token);
          // Also save refresh token if available
          if (tokenData.refresh_token) {
            await saveServiceToken("TWITTER_REFRESH_TOKEN", tokenData.refresh_token);
          }
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: tokenData.error_description || "Token exchange failed" });
        }
      } catch (err) {
        authWin.close();
        resolve({ ok: false, error: err.message });
      }
    });

    // Also handle navigation to the callback (some OAuth flows use navigation instead of redirect)
    authWin.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith(redirectUri)) {
        // Let will-redirect handle it
      }
    });

    authWin.on("closed", () => resolve({ ok: false, error: "Window closed" }));
    authWin.loadURL(authUrl.toString());
  });
}

// ── Substack: Cookie capture via browser login ──────────────────────────────
async function connectSubstack() {
  return captureCookie({
    title: "Sign in to Substack",
    loginUrl: "https://substack.com/sign-in",
    domain: "substack.com",
    cookieName: "substack.sid",
    envKey: "SUBSTACK_SESSION",
  });
}

// ── LinkedIn: Cookie capture via browser login ──────────────────────────────
async function connectLinkedIn() {
  return captureCookie({
    title: "Sign in to LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    domain: ".linkedin.com",
    cookieName: "li_at",
    envKey: "LINKEDIN_SESSION",
  });
}

// ── Generic cookie capture flow ─────────────────────────────────────────────
function captureCookie({ title, loginUrl, domain, cookieName, envKey }) {
  return new Promise((resolve) => {
    // Use a separate session partition so we don't pollute the main session
    const partition = `persist:auth-${envKey}`;
    const authSession = session.fromPartition(partition);

    const authWin = new BrowserWindow({
      parent: mainWindow,
      width: 500,
      height: 700,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition,
      },
    });

    let resolved = false;

    // Poll for the target cookie after each navigation
    const checkCookie = async () => {
      if (resolved) return;
      try {
        const cookies = await authSession.cookies.get({ domain, name: cookieName });
        if (cookies.length > 0) {
          resolved = true;
          const token = cookies[0].value;
          await saveServiceToken(envKey, token);
          authWin.close();
          resolve({ ok: true });
        }
      } catch { /* ignore */ }
    };

    authWin.webContents.on("did-navigate", checkCookie);
    authWin.webContents.on("did-navigate-in-page", checkCookie);
    // Also check periodically for SPAs that don't trigger navigation events
    const interval = setInterval(checkCookie, 2000);

    authWin.on("closed", () => {
      clearInterval(interval);
      if (!resolved) resolve({ ok: false, error: "Window closed before login completed" });
    });

    authWin.loadURL(loginUrl);
  });
}

// ── Input prompt helper ─────────────────────────────────────────────────────
function promptInput(title, message) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 480,
      height: 200,
      resizable: false,
      title,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const html = `<!DOCTYPE html>
<html><head><style>
body { font-family: -apple-system, sans-serif; padding: 20px; background: var(--bg, #1e1e2e); color: var(--fg, #cdd6f4); }
@media (prefers-color-scheme: light) { body { --bg: #fff; --fg: #1f2328; --ibg: #f6f8fa; --border: #d0d7de; --btn: #0969da; } }
@media (prefers-color-scheme: dark) { body { --bg: #1e1e2e; --fg: #cdd6f4; --ibg: #313244; --border: #45475a; --btn: #89b4fa; } }
p { margin-bottom: 10px; font-size: 14px; }
input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border, #45475a); background: var(--ibg, #313244); color: var(--fg); font-size: 14px; outline: none; box-sizing: border-box; }
.btns { margin-top: 12px; display: flex; gap: 8px; }
button { padding: 8px 20px; border-radius: 6px; border: none; background: var(--btn, #89b4fa); color: white; font-weight: 600; cursor: pointer; }
button.cancel { background: var(--border, #45475a); }
</style></head><body>
<p>${message}</p>
<input id="v" placeholder="Paste here..." autofocus />
<div class="btns"><button onclick="done()">OK</button><button class="cancel" onclick="window.close()">Cancel</button></div>
<script>
const input = document.getElementById('v');
input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
function done() {
  const v = input.value.trim();
  document.title = 'RESULT:' + v;
}
</script></body></html>`;

    // Watch for title change to get the result
    win.on("page-title-updated", (e, newTitle) => {
      if (newTitle.startsWith("RESULT:")) {
        const value = newTitle.slice(7);
        win.close();
        resolve(value || null);
      }
    });

    win.on("closed", () => resolve(null));
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

// ── IPC handler for service connections ──────────────────────────────────────
ipcMain.handle("connect-service", async (event, serviceId) => {
  console.log(`[Electron] Connecting service: ${serviceId}`);
  switch (serviceId) {
    case "twitter": return connectTwitter();
    case "substack": return connectSubstack();
    case "linkedin": return connectLinkedIn();
    default: return { ok: false, error: `Unknown service: ${serviceId}` };
  }
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
  if (mainWindow === null) {
    const port = serverInstance?.address?.()?.port || 3001;
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
