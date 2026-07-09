const { contextBridge, ipcRenderer } = require("electron");
const packageJson = require("../package.json");

contextBridge.exposeInMainWorld("aiKnowledge", {
  appVersion: packageJson.version,
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke("ai-knowledge:download-update", payload),
  onUpdateDownloadProgress: (callback) => {
    if (typeof callback !== "function") {
      return undefined;
    }

    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on("ai-knowledge:update-download-progress", listener);

    return () => {
      ipcRenderer.removeListener("ai-knowledge:update-download-progress", listener);
    };
  },
  openExternal: (url) => ipcRenderer.invoke("ai-knowledge:open-external", url)
});
