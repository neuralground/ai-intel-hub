// Preload script — runs in renderer context before web content loads.
// Exposes a minimal API to the renderer via contextBridge if needed.
// Currently the app communicates entirely via HTTP to the embedded Express
// server, so no IPC bridge is required.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
});
