// Set ELECTRON_MODE before any backend imports to prevent auto-start
process.env.ELECTRON_MODE = "1";

import { app, BrowserWindow, shell, Menu, dialog, powerMonitor } from "electron";
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
