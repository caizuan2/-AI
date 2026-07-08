const { contextBridge, ipcRenderer } = require("electron");
const packageJson = require("../package.json");

contextBridge.exposeInMainWorld("aiKnowledge", {
  appVersion: packageJson.version,
  openExternal: (url) => ipcRenderer.invoke("ai-knowledge:open-external", url)
});
