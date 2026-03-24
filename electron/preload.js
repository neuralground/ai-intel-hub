const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  // Trigger an OAuth or cookie-capture flow for a third-party service.
  // Returns a promise that resolves with { ok, token?, error? }.
  connectService: (serviceId) => ipcRenderer.invoke("connect-service", serviceId),
  connectFeed: (opts) => ipcRenderer.invoke("connect-feed", opts),
  // Generate a PDF and save to a user-selected location.
  savePDF: (opts) => ipcRenderer.invoke("save-pdf", opts),
});
