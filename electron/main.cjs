const { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const path = require("node:path");

const USER_APP_URL =
  process.env.USER_APP_URL ||
  process.env.NEXT_PUBLIC_USER_APP_URL ||
  "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui";
const USER_CHAT_URL = "https://stately-sawine-1efd4d.netlify.app/chat-ui";
const LATEST_MANIFEST_URL =
  process.env.LATEST_MANIFEST_URL ||
  process.env.NEXT_PUBLIC_LATEST_MANIFEST_URL ||
  "https://stately-sawine-1efd4d.netlify.app/releases/latest.json";
const ELECTRON_AUTO_UPDATE_FEED_URL = process.env.ELECTRON_AUTO_UPDATE_FEED_URL || "";

let mainWindow = null;
let manualUpdatePromptShown = false;
let electronAutoUpdaterConfigured = false;

function isAllowedAppUrl(targetUrl) {
  try {
    const appUrl = new URL(USER_APP_URL);
    const url = new URL(targetUrl);

    return url.origin === appUrl.origin && !isForbiddenUserAppUrl(url);
  } catch {
    return false;
  }
}

function isForbiddenUserAppUrl(url) {
  const blockedPrefixes = ["/ingest", "/admin", "/api/admin"];
  return blockedPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

function openExternalUrl(targetUrl) {
  void shell.openExternal(targetUrl);
}

function isHttpUrl(targetUrl) {
  try {
    const url = new URL(targetUrl);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function compareVersions(left, right) {
  const leftParts = getString(left).split(".").map((part) => Number(part) || 0);
  const rightParts = getString(right).split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function getLatestUserRelease(manifest) {
  const userRelease = manifest?.user;

  if (userRelease && typeof userRelease === "object") {
    return userRelease;
  }

  const app = manifest?.apps?.user;
  const versions = Array.isArray(app?.versions) ? app.versions : [];

  return versions.find((item) => item?.version === app?.active_version) || versions[0] || manifest;
}

function resolveDesktopUpdateUrl(release) {
  return getString(release?.exe_url)
    || getString(release?.download?.windows)
    || getString(release?.download_page)
    || getString(release?.web_url)
    || USER_APP_URL;
}

function isNewerRelease(release) {
  const latestVersion = getString(release?.version);

  if (!latestVersion) {
    return false;
  }

  return compareVersions(latestVersion, app.getVersion()) > 0;
}

async function checkLatestJsonUpdate() {
  if (manualUpdatePromptShown || typeof fetch !== "function") {
    return;
  }

  try {
    const response = await fetch(LATEST_MANIFEST_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    const manifest = await response.json();
    const release = getLatestUserRelease(manifest);

    if (!release || !isNewerRelease(release)) {
      return;
    }

    const updateUrl = resolveDesktopUpdateUrl(release);

    if (!isHttpUrl(updateUrl)) {
      return;
    }

    manualUpdatePromptShown = true;
    const forceUpdate = release.force_update === true || release.forceUpdate === true;
    const changelog = Array.isArray(release.changelog) ? release.changelog.join("\n") : "";
    const detail = [
      `当前版本：${app.getVersion()}`,
      `最新版本：${release.version}${getNumber(release.build) > 0 ? ` (Build ${release.build})` : ""}`,
      changelog ? `\n更新内容：\n${changelog}` : ""
    ].join("\n");
    const buttons = forceUpdate ? ["立即更新"] : ["立即更新", "稍后"];
    const result = await dialog.showMessageBox(mainWindow, {
      type: forceUpdate ? "warning" : "info",
      buttons,
      defaultId: 0,
      cancelId: forceUpdate ? 0 : 1,
      noLink: true,
      title: "发现新版本",
      message: forceUpdate ? "必须更新到最新版本后才能继续使用。" : "发现新版本，是否立即更新？",
      detail
    });

    if (result.response === 0 || forceUpdate) {
      openExternalUrl(updateUrl);
    }
  } catch {
    // Update checks must never block app startup.
  }
}

function setupElectronAutoUpdater() {
  if (electronAutoUpdaterConfigured || !ELECTRON_AUTO_UPDATE_FEED_URL) {
    return;
  }

  electronAutoUpdaterConfigured = true;

  try {
    autoUpdater.setFeedURL({ url: ELECTRON_AUTO_UPDATE_FEED_URL });
    autoUpdater.on("update-downloaded", async () => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["重启更新", "稍后"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "更新已下载",
        message: "新版本已下载完成，重启后生效。"
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
    autoUpdater.on("error", () => undefined);
    autoUpdater.checkForUpdates();
  } catch {
    // The GitHub latest.json fallback remains available when no native feed is configured.
  }
}

function handleNavigationTarget(targetUrl) {
  try {
    const appUrl = new URL(USER_APP_URL);
    const url = new URL(targetUrl);

    if (url.origin !== appUrl.origin) {
      openExternalUrl(targetUrl);
      return;
    }

    if (isForbiddenUserAppUrl(url)) {
      void mainWindow.loadURL(USER_CHAT_URL);
      return;
    }

    void mainWindow.loadURL(targetUrl);
  } catch {
    openExternalUrl(targetUrl);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "AI知识库助手",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.loadURL(USER_APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleNavigationTarget(url);

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url)) {
      return;
    }

    event.preventDefault();
    handleNavigationTarget(url);
  });

  mainWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    if (isAllowedAppUrl(url)) {
      return;
    }

    handleNavigationTarget(url);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const openDevtools =
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i");

    if (openDevtools) {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.once("did-finish-load", () => {
    setupElectronAutoUpdater();
    void checkLatestJsonUpdate();
  });
}

ipcMain.handle("ai-knowledge:open-external", (_event, targetUrl) => {
  if (typeof targetUrl !== "string" || !isHttpUrl(targetUrl)) {
    return false;
  }

  openExternalUrl(targetUrl);
  return true;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
