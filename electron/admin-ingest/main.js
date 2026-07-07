const { app, BrowserView, BrowserWindow, Menu, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const APP_NAME = "AI知识库投喂端";
const APP_ID = "com.aiknowledge.ingestadmin.desktop";
const SESSION_PARTITION = "persist:admin-ingest";
const DEFAULT_ADMIN_INGEST_URL = "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=exe";
const READY_CHECK_RETRIES = Number.parseInt(process.env.ADMIN_INGEST_READY_RETRIES || "60", 10);
const READY_CHECK_INTERVAL_MS = Number.parseInt(process.env.ADMIN_INGEST_READY_INTERVAL_MS || "1000", 10);
const READY_CHECK_TIMEOUT_MS = Number.parseInt(process.env.ADMIN_INGEST_READY_TIMEOUT_MS || "1800", 10);
const LOG_FILE = path.join(os.tmpdir(), "admin-ingest-desktop.log");

let mainWindow = null;
let ingestView = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

function log(message, detail) {
  const line = detail === undefined
    ? `[admin-ingest-desktop] ${message}`
    : `[admin-ingest-desktop] ${message} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;

  if (detail === undefined) {
    console.log(line);
  } else {
    console.log(line);
  }

  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // Logging must never break the desktop shell.
  }
}

function isBlockedUrl(url) {
  return url.searchParams.get("app") === "user"
    || url.pathname === "/chat-ui"
    || url.pathname.startsWith("/chat-ui/");
}

function normalizeTargetUrl(candidate) {
  const fallback = new URL(DEFAULT_ADMIN_INGEST_URL);

  try {
    const url = new URL(candidate || DEFAULT_ADMIN_INGEST_URL);

    if (isBlockedUrl(url)) {
      return fallback.toString();
    }

    if (!url.pathname.startsWith("/admin-ingest")) {
      url.pathname = "/admin-ingest";
    }

    url.searchParams.set("app", "ingest-admin");
    url.searchParams.set("platform", "exe");

    return url.toString();
  } catch {
    return fallback.toString();
  }
}

function getAppUrl() {
  return normalizeTargetUrl(process.env.ADMIN_INGEST_APP_URL);
}

function getTargetPort(targetUrl) {
  try {
    const url = new URL(targetUrl);

    if (url.port) {
      return url.port;
    }

    return url.protocol === "https:" ? "443" : "80";
  } catch {
    return "3020";
  }
}

function buildDevServerCommand(targetUrl) {
  const port = getTargetPort(targetUrl);
  const cwd = process.cwd();

  return {
    cwd,
    port,
    display: [
      `cd "${cwd}"`,
      `npm run dev -- -p ${port}`
    ].join("\n")
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function loadHtml(html) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve();
  }

  return mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function resizeIngestView() {
  if (!mainWindow || mainWindow.isDestroyed() || !ingestView) {
    return;
  }

  const [width, height] = mainWindow.getContentSize();
  ingestView.setBounds({
    x: 0,
    y: 0,
    width,
    height
  });
  ingestView.setAutoResize({
    width: true,
    height: true
  });
}

function removeIngestView() {
  if (!mainWindow || mainWindow.isDestroyed() || !ingestView) {
    ingestView = null;
    return;
  }

  mainWindow.removeBrowserView(ingestView);
  ingestView.webContents.destroy();
  ingestView = null;
}

function renderShellPage({ title, message, detail, tone = "loading" }) {
  const color = tone === "error" ? "#b42318" : "#128246";
  const background = tone === "error" ? "#fff4f2" : "#f0fff6";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(APP_NAME)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f7f7f6;
      color: #202020;
      font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    }
    main {
      width: min(620px, calc(100vw - 48px));
      border: 1px solid #e7e7e4;
      border-radius: 24px;
      background: #fff;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.10);
      padding: 28px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: ${background};
      color: ${color};
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      margin-bottom: 18px;
    }
    h1 { margin: 0; font-size: 24px; line-height: 1.35; }
    p { margin: 12px 0 0; color: #666; line-height: 1.8; font-size: 14px; }
    pre {
      margin: 16px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: 16px;
      background: #f6f6f5;
      padding: 14px;
      color: #333;
      font-size: 13px;
      line-height: 1.65;
    }
  </style>
</head>
<body>
  <main>
    <span class="badge">${tone === "error" ? "启动失败" : "正在启动"}</span>
    <h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(message)}</p>
    ${detail ? `<pre>${htmlEscape(detail)}</pre>` : ""}
  </main>
</body>
</html>`;
}

function attachWebContentsDiagnostics(webContents, label) {
  webContents.on("did-start-loading", () => {
    log(`${label} did-start-loading`, webContents.getURL());
  });

  webContents.on("dom-ready", () => {
    log(`${label} dom-ready`, webContents.getURL());
    void webContents.executeJavaScript(`({
      url: location.href,
      title: document.title,
      bodyTextLength: document.body?.innerText?.trim()?.length ?? 0,
      bodyTextPreview: document.body?.innerText?.trim()?.slice(0, 220) ?? "",
      rootChildCount: document.body?.children?.length ?? 0
    })`).then((snapshot) => {
      log(`${label} dom snapshot`, snapshot);
    }).catch((error) => {
      log(`${label} dom snapshot failed`, error instanceof Error ? error.message : String(error));
    });
  });

  webContents.on("did-finish-load", () => {
    log(`${label} did-finish-load`, webContents.getURL());
    mainWindow?.setTitle(APP_NAME);
  });

  webContents.on("console-message", (_event, level, message, line, sourceId) => {
    log(`${label} renderer console`, {
      level,
      message,
      line,
      sourceId
    });
  });

  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    log(`${label} did-fail-load`, {
      errorCode,
      errorDescription,
      validatedUrl
    });
  });

  webContents.on("render-process-gone", (_event, details) => {
    log(`${label} render-process-gone`, details);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);

      if (isBlockedUrl(parsedUrl)) {
        redirectToAdminIngest();
        return { action: "deny" };
      }

      if (shouldOpenExternally(url)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }

      return { action: "allow" };
    } catch {
      return { action: "deny" };
    }
  });

  webContents.on("will-navigate", (event, url) => {
    try {
      const parsedUrl = new URL(url);

      if (isBlockedUrl(parsedUrl)) {
        event.preventDefault();
        redirectToAdminIngest();
        return;
      }

      if (shouldOpenExternally(url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
}

function loadAdminIngestView(targetUrl) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      reject(new Error("Main window is not available."));
      return;
    }

    removeIngestView();
    ingestView = new BrowserView({
      webPreferences: {
        partition: SESSION_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    attachWebContentsDiagnostics(ingestView.webContents, "ingest-view");

    let settled = false;
    const timeoutMs = Number.parseInt(process.env.ADMIN_INGEST_VIEW_TIMEOUT_MS || "30000", 10);
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`投喂端页面加载超时：${targetUrl}`));
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000);

    ingestView.webContents.once("did-finish-load", () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve();
    });

    ingestView.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(new Error(`${errorDescription} (${errorCode}) ${validatedUrl}`));
    });

    mainWindow.setBrowserView(ingestView);
    resizeIngestView();
    void ingestView.webContents.loadURL(targetUrl);
  });
}

function checkUrlReady(targetUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, {
      timeout: READY_CHECK_TIMEOUT_MS,
      headers: {
        "User-Agent": "AIKnowledgeAdminIngestDesktop/1.0"
      }
    }, (response) => {
      response.resume();
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 400,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Timeout after ${READY_CHECK_TIMEOUT_MS}ms`));
    });

    request.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        ok: false,
        error: error.message
      });
    });
  });
}

function stripFrameBlockingHeaders(headers) {
  const nextHeaders = { ...headers };

  for (const key of Object.keys(nextHeaders)) {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "x-frame-options") {
      delete nextHeaders[key];
      continue;
    }

    if (normalizedKey === "content-security-policy") {
      const values = Array.isArray(nextHeaders[key]) ? nextHeaders[key] : [nextHeaders[key]];
      const filteredValues = values
        .filter(Boolean)
        .map((value) => String(value)
          .split(";")
          .map((directive) => directive.trim())
          .filter((directive) => directive && !directive.toLowerCase().startsWith("frame-ancestors"))
          .join("; "))
        .filter(Boolean);

      if (filteredValues.length > 0) {
        nextHeaders[key] = filteredValues;
      } else {
        delete nextHeaders[key];
      }
    }
  }

  return nextHeaders;
}

async function waitForUrlReady(targetUrl) {
  const attempts = Number.isFinite(READY_CHECK_RETRIES) && READY_CHECK_RETRIES > 0
    ? READY_CHECK_RETRIES
    : 60;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await checkUrlReady(targetUrl);

    if (result.ok) {
      log(`Web service ready on attempt ${attempt}`, targetUrl);
      return result;
    }

    log(`Web service not ready on attempt ${attempt}/${attempts}`, result);

    if (attempt < attempts) {
      await sleep(READY_CHECK_INTERVAL_MS);
    }
  }

  return {
    ok: false,
    error: `Target URL did not return 200 after ${attempts} attempts.`
  };
}

async function prepareSessionForTarget(targetUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const url = new URL(targetUrl);
  const currentSession = mainWindow.webContents.session;
  const targetOriginPattern = `${url.origin}/*`;

  currentSession.webRequest.onHeadersReceived({ urls: [targetOriginPattern] }, (details, callback) => {
    callback({
      responseHeaders: stripFrameBlockingHeaders(details.responseHeaders || {})
    });
  });
  currentSession.webRequest.onBeforeRequest({ urls: [targetOriginPattern] }, (details, callback) => {
    if (details.resourceType === "mainFrame" || details.url.includes("/admin-ingest")) {
      log("session request", {
        resourceType: details.resourceType,
        method: details.method,
        url: details.url
      });
    }
    callback({});
  });
  currentSession.webRequest.onResponseStarted({ urls: [targetOriginPattern] }, (details) => {
    if (details.resourceType === "mainFrame" || details.url.includes("/admin-ingest")) {
      log("session response started", {
        resourceType: details.resourceType,
        statusCode: details.statusCode,
        url: details.url
      });
    }
  });
  currentSession.webRequest.onCompleted({ urls: [targetOriginPattern] }, (details) => {
    if (details.resourceType === "mainFrame" || details.url.includes("/admin-ingest")) {
      log("session request completed", {
        resourceType: details.resourceType,
        statusCode: details.statusCode,
        url: details.url
      });
    }
  });
  currentSession.webRequest.onErrorOccurred({ urls: [targetOriginPattern] }, (details) => {
    if (details.resourceType === "mainFrame" || details.url.includes("/admin-ingest")) {
      log("session request error", {
        resourceType: details.resourceType,
        error: details.error,
        url: details.url
      });
    }
  });
  log("Frame blocking headers disabled for", targetOriginPattern);

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    await currentSession.setProxy({ mode: "direct" });
    log("Session proxy mode", "direct");
  }

  await currentSession.clearCache();
  await currentSession.clearStorageData({
    storages: ["serviceworkers", "cachestorage"]
  });
  log("Session cache cleared");
}

async function loadAdminIngestUrl() {
  const targetUrl = getAppUrl();

  log("Target URL", targetUrl);
  await loadHtml(renderShellPage({
    title: "正在连接管理员投喂端",
    message: "正在等待 Next.js Web 服务就绪，请稍候。",
    detail: targetUrl
  }));

  const readyResult = await waitForUrlReady(targetUrl);

  if (!readyResult.ok) {
    const command = buildDevServerCommand(targetUrl);
    const detail = [
      `目标地址：${targetUrl}`,
      `检测结果：${readyResult.error || `${readyResult.statusCode} ${readyResult.statusMessage || ""}`}`,
      "",
      "请先在 Worktree 2 运行：",
      command.display
    ].filter(Boolean).join("\n");

    await loadHtml(renderShellPage({
      title: "投喂端 Web 服务未启动",
      message: "Electron 已启动，但没有检测到可用的 /admin-ingest Web 服务，因此不会显示白屏。",
      detail,
      tone: "error"
    }));
    return;
  }

  try {
    await prepareSessionForTarget(targetUrl);
    await loadAdminIngestView(targetUrl);
  } catch (error) {
    log("loadURL failed", error);
    removeIngestView();
    await loadHtml(renderShellPage({
      title: "投喂端页面加载失败",
      message: "Electron 无法加载 /admin-ingest 页面，请查看终端日志中的 did-fail-load 或 loadURL 错误。",
      detail: error instanceof Error ? error.message : String(error),
      tone: "error"
    }));
  }
}

function redirectToAdminIngest() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  void loadAdminIngestUrl();
}

function shouldOpenExternally(targetUrl) {
  try {
    const appUrl = new URL(getAppUrl());
    const url = new URL(targetUrl);

    if (isBlockedUrl(url)) {
      return false;
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin !== appUrl.origin;
    }

    return true;
  } catch {
    return true;
  }
}

function createWindow() {
  log("Log file", LOG_FILE);

  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f7f7f6",
    webPreferences: {
      partition: SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setTitle(APP_NAME);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow?.setTitle(APP_NAME);
  });

  mainWindow.on("unresponsive", () => {
    log("BrowserWindow unresponsive");
  });

  mainWindow.on("resize", resizeIngestView);
  mainWindow.on("maximize", resizeIngestView);
  mainWindow.on("restore", resizeIngestView);

  mainWindow.webContents.on("did-start-loading", () => {
    log("did-start-loading", mainWindow?.webContents.getURL());
  });

  mainWindow.webContents.on("dom-ready", () => {
    log("dom-ready", mainWindow?.webContents.getURL());
    void mainWindow?.webContents.executeJavaScript(`({
      url: location.href,
      title: document.title,
      bodyTextLength: document.body?.innerText?.trim()?.length ?? 0,
      bodyTextPreview: document.body?.innerText?.trim()?.slice(0, 220) ?? "",
      rootChildCount: document.body?.children?.length ?? 0
    })`).then((snapshot) => {
      log("dom snapshot", snapshot);
    }).catch((error) => {
      log("dom snapshot failed", error instanceof Error ? error.message : String(error));
    });
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log("did-finish-load", mainWindow?.webContents.getURL());
    mainWindow?.setTitle(APP_NAME);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    log("renderer console", {
      level,
      message,
      line,
      sourceId
    });
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    log("did-fail-load", {
      errorCode,
      errorDescription,
      validatedUrl
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("render-process-gone", details);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);

      if (isBlockedUrl(parsedUrl)) {
        redirectToAdminIngest();
        return { action: "deny" };
      }

      if (shouldOpenExternally(url)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }

      return { action: "allow" };
    } catch {
      return { action: "deny" };
    }
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsedUrl = new URL(url);

      if (isBlockedUrl(parsedUrl)) {
        event.preventDefault();
        redirectToAdminIngest();
        return;
      }

      if (shouldOpenExternally(url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  void loadAdminIngestUrl();
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
