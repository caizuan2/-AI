const { app, BrowserWindow, Menu, shell } = require("electron");

const USER_APP_URL =
  process.env.USER_APP_URL ||
  process.env.NEXT_PUBLIC_USER_APP_URL ||
  "https://stately-sawine-1efd4d.netlify.app/login";

let mainWindow = null;

function isAllowedAppUrl(targetUrl) {
  try {
    const appUrl = new URL(USER_APP_URL);
    const url = new URL(targetUrl);

    return url.origin === appUrl.origin;
  } catch {
    return false;
  }
}

function openExternalUrl(targetUrl) {
  void shell.openExternal(targetUrl);
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
      sandbox: true
    }
  });

  mainWindow.loadURL(USER_APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url)) {
      void mainWindow.loadURL(url);
    } else {
      openExternalUrl(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url)) {
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
