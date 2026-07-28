const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

function readBuildMetadata() {
  const fallback = {
    version: "0.0.0",
    build: 0,
    webReleaseSha: "",
    platform: process.platform === "darwin" ? "macos" : "exe"
  };

  try {
    const metadataPath = path.join(__dirname, "build-metadata.json");
    return {
      ...fallback,
      ...JSON.parse(fs.readFileSync(metadataPath, "utf8"))
    };
  } catch {
    return fallback;
  }
}

const buildMetadata = readBuildMetadata();

contextBridge.exposeInMainWorld("aiKnowledge", {
  appVersion: buildMetadata.version,
  appBuild: buildMetadata.build,
  webReleaseSha: buildMetadata.webReleaseSha,
  platform: buildMetadata.platform,
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke("admin-ingest:download-update", payload),
  onUpdateDownloadProgress: (callback) => {
    if (typeof callback !== "function") {
      return undefined;
    }

    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on("admin-ingest:update-download-progress", listener);

    return () => {
      ipcRenderer.removeListener("admin-ingest:update-download-progress", listener);
    };
  }
});
