const { app, BrowserWindow, Menu, shell } = require("electron");

const ADMIN_APP_URL =
  process.env.ADMIN_APP_URL ||
  "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest";

let mainWindow = null;

function isSameAdminOrigin(targetUrl) {
  try {
    const appUrl = new URL(ADMIN_APP_URL);
    const url = new URL(targetUrl);

    return url.origin === appUrl.origin;
  } catch {
    return false;
  }
}

function openExternalUrl(targetUrl) {
  void shell.openExternal(targetUrl);
}

function handleNavigationTarget(targetUrl) {
  if (isSameAdminOrigin(targetUrl)) {
    void mainWindow.loadURL(targetUrl);
    return;
  }

  openExternalUrl(targetUrl);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    title: "AI知识库管理后台",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: `${__dirname}/preload.cjs`
    }
  });

  mainWindow.loadURL(ADMIN_APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleNavigationTarget(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isSameAdminOrigin(url)) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
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
}

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
