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

// Apply saved settings to environment
const settings = loadSettings();
if (settings.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY;
if (settings.RELEVANCE_CONTEXT) process.env.RELEVANCE_CONTEXT = settings.RELEVANCE_CONTEXT;
if (settings.FEED_REFRESH_INTERVAL) process.env.FEED_REFRESH_INTERVAL = settings.FEED_REFRESH_INTERVAL;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AI Intelligence Hub",
    backgroundColor: "#0A0E14",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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

async function showSettingsDialog() {
  const current = loadSettings();

  // Use a simple prompt approach via dialog
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Settings",
    message: "AI Intelligence Hub Settings",
    detail: [
      `API Key: ${current.ANTHROPIC_API_KEY ? "configured" : "not set"}`,
      `Relevance Context: ${current.RELEVANCE_CONTEXT || "(default)"}`,
      `Refresh Interval: ${current.FEED_REFRESH_INTERVAL || "30"} minutes`,
      "",
      "Settings are stored in:",
      SETTINGS_FILE,
      "",
      "To update, edit the settings file directly or use the buttons below.",
    ].join("\n"),
    buttons: ["OK", "Open Settings File", "Set API Key"],
  });

  if (response === 1) {
    // Open settings file - create if doesn't exist
    if (!fs.existsSync(SETTINGS_FILE)) {
      saveSettings({
        ANTHROPIC_API_KEY: "",
        RELEVANCE_CONTEXT: "Senior technology executive at a major bank focused on AI strategy, architecture, and governance.",
        FEED_REFRESH_INTERVAL: "30",
      });
    }
    shell.openPath(SETTINGS_FILE);
  } else if (response === 2) {
    // Prompt for API key
    const win = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 500,
      height: 200,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Set Anthropic API Key",
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const html = `<!DOCTYPE html>
<html><head><style>
body { font-family: -apple-system, sans-serif; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
input { width: 100%; padding: 10px; margin: 10px 0; border-radius: 6px; border: 1px solid #45475a; background: #313244; color: #cdd6f4; font-size: 14px; }
button { padding: 8px 20px; border-radius: 6px; border: none; background: #89b4fa; color: #1e1e2e; font-weight: 600; cursor: pointer; margin-right: 8px; }
button.cancel { background: #45475a; color: #cdd6f4; }
</style></head><body>
<h3>Anthropic API Key</h3>
<input type="password" id="key" placeholder="sk-ant-..." value="${current.ANTHROPIC_API_KEY || ""}" />
<div><button onclick="save()">Save</button><button class="cancel" onclick="window.close()">Cancel</button></div>
<script>
function save() {
  const key = document.getElementById('key').value;
  fetch('http://localhost:${serverInstance?.address?.()?.port || 3001}/api/electron/settings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ANTHROPIC_API_KEY: key})
  }).then(() => window.close());
}
</script></body></html>`;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
