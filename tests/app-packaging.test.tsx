import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DownloadPage from "../app/download/page";

const userAppUrl = "https://stately-sawine-1efd4d.netlify.app/chat-ui";
const userLoginUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui";

async function main() {
  const pageMarkup = renderToStaticMarkup(<DownloadPage />);

  assert.match(pageMarkup, /AI知识库助手下载/);
  assert.match(pageMarkup, /用户端/);
  assert.match(pageMarkup, /Android APK 下载/);
  assert.match(pageMarkup, /Windows EXE 下载/);
  assert.match(pageMarkup, /登录普通用户账号/);
  assert.doesNotMatch(pageMarkup, /投喂/);
  assert.doesNotMatch(pageMarkup, /AI知识库管理后台下载/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat-latest\.apk/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat-latest\.exe/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat\.apk/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat\.exe/);

  const electronMain = readFileSync("electron/main.cjs", "utf8");
  const capacitorConfig = readFileSync("capacitor.config.ts", "utf8");
  const appShell = readFileSync("app-shell/index.html", "utf8");
  const mainActivity = readFileSync("android/app/src/main/java/com/aiknowledge/chat/MainActivity.java", "utf8");
  const loginPage = readFileSync("app/login/page.tsx", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(electronMain, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(electronMain, /USER_CHAT_URL\s*=\s*"https:\/\/stately-sawine-1efd4d\.netlify\.app\/chat-ui"/);
  assert.match(electronMain, /blockedPrefixes\s*=\s*\["\/ingest",\s*"\/admin",\s*"\/api\/admin"\]/);
  assert.match(electronMain, /isForbiddenUserAppUrl/);
  assert.match(electronMain, /did-navigate-in-page/);
  assert.match(electronMain, /nodeIntegration:\s*false/);
  assert.match(electronMain, /contextIsolation:\s*true/);
  assert.match(electronMain, /sandbox:\s*true/);
  assert.doesNotMatch(electronMain, /stately-sawine-1efd4d\.netlify\.app\/ingest/);
  assert.doesNotMatch(electronMain, /stately-sawine-1efd4d\.netlify\.app\/admin/);

  assert.match(capacitorConfig, /appId:\s*"com\.aiknowledge\.chat"/);
  assert.match(capacitorConfig, /appName:\s*"AI知识库助手"/);
  assert.match(capacitorConfig, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(capacitorConfig, new RegExp(userLoginUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(capacitorConfig, /cleartext:\s*false/);
  assert.doesNotMatch(capacitorConfig, /stately-sawine-1efd4d\.netlify\.app\/ingest/);
  assert.match(appShell, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(appShell, new RegExp(userLoginUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(appShell, /stately-sawine-1efd4d\.netlify\.app\/ingest/);

  assert.match(mainActivity, /APP_ORIGIN\s*=\s*"https:\/\/stately-sawine-1efd4d\.netlify\.app"/);
  assert.match(mainActivity, /USER_CHAT_URL\s*=\s*APP_ORIGIN \+ "\/chat-ui"/);
  assert.match(mainActivity, /CookieManager\.getInstance\(\)/);
  assert.match(mainActivity, /setAcceptCookie\(true\)/);
  assert.match(mainActivity, /setAcceptThirdPartyCookies\(webView,\s*true\)/);
  assert.match(mainActivity, /setJavaScriptEnabled\(true\)/);
  assert.match(mainActivity, /setDomStorageEnabled\(true\)/);
  assert.match(mainActivity, /setDatabaseEnabled\(true\)/);
  assert.match(mainActivity, /setAllowFileAccess\(true\)/);
  assert.match(mainActivity, /setAllowContentAccess\(true\)/);
  assert.match(mainActivity, /setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(mainActivity, /setWebChromeClient\(new AppWebChromeClient\(getBridge\(\)\)\)/);
  assert.match(mainActivity, /extends BridgeWebChromeClient/);
  assert.match(mainActivity, /onShowFileChooser/);
  assert.match(mainActivity, /fileChooserParams\.isCaptureEnabled\(\)/);
  assert.match(mainActivity, /super\.onShowFileChooser\(webView,\s*filePathCallback,\s*fileChooserParams\)/);
  assert.match(mainActivity, /Intent\.ACTION_OPEN_DOCUMENT/);
  assert.match(mainActivity, /Intent\.EXTRA_MIME_TYPES/);
  assert.match(mainActivity, /Intent\.EXTRA_ALLOW_MULTIPLE/);
  assert.match(mainActivity, /ValueCallback<Uri\[]>/);
  assert.match(mainActivity, /onActivityResult/);
  assert.match(mainActivity, /application\/vnd\.ms-powerpoint/);
  assert.match(mainActivity, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.doesNotMatch(mainActivity, /clearCookies|clearCache|WebStorage\.getInstance\(\)\.deleteAllData/);
  assert.match(mainActivity, /path\.equals\("\/ingest"\)/);
  assert.match(mainActivity, /path\.equals\("\/admin"\)/);
  assert.match(mainActivity, /path\.equals\("\/api\/admin"\)/);
  assert.match(mainActivity, /__aiUserAppRouteGuardInstalled/);
  assert.match(mainActivity, /history\.pushState/);

  assert.match(loginPage, /fetch\("\/api\/auth\/me"/);
  assert.match(loginPage, /正在检查登录状态/);
  assert.match(loginPage, /router\.replace\(nextPath \|\| \(payload\?\.data\?\.user\.licenseActivated \? "\/ingest" : "\/unlock"\)\)/);

  assert.equal(packageJson.scripts["app:android"], "powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1");
  assert.equal(packageJson.scripts["app:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-windows-exe.ps1");
  assert.equal(packageJson.build.appId, "com.aiknowledge.chat.desktop");
  assert.match(packageJson.build.productName, /AI/);

  const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(prismaSchema, /ai-knowledge-chat|NEXT_PUBLIC_USER_APP_URL|USER_APP_URL/);
  if (existsSync("prisma/migrations")) {
    const packagingMigrations = readdirSync("prisma/migrations").filter((name) =>
      /packaging|download|installer|login-entry/i.test(name)
    );
    assert.deepEqual(packagingMigrations, []);
  }

  console.log("App packaging tests passed.");
}

void main();
