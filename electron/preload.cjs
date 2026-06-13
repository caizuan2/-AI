const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiKnowledge", {
  openExternal: (url) => ipcRenderer.invoke("ai-knowledge:open-external", url)
});
