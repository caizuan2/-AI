import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DownloadPage from "../app/download/page";
import { normalizeLatestReleaseManifest } from "../lib/app-update";
import latestRelease from "../public/releases/latest.json";
import versionInfo from "../version.json";

const electronUserAppUrl = "https://stately-sawine-1efd4d.netlify.app/chat-ui";
const userLoginUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui";
const userWebAppUrl = "http://47.238.0.23/app/chat";
const parsedLatestRelease = normalizeLatestReleaseManifest(latestRelease);

assert.ok(parsedLatestRelease);
const latestUserRelease = parsedLatestRelease.user;
const userWindowsExeUrl = latestUserRelease.exe_url;
const userAndroidApkUrl = latestUserRelease.apk_url;

async function main() {
  const pageMarkup = renderToStaticMarkup(<DownloadPage />);
  const escapedUserVersion = latestUserRelease.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  assert.match(pageMarkup, /小董AI下载/);
  assert.match(pageMarkup, /用户端/);
  assert.match(pageMarkup, /Android APK 下载/);
  assert.match(pageMarkup, /Windows EXE 下载/);
  assert.match(pageMarkup, new RegExp(`最新版本 ${escapedUserVersion}`));
  assert.match(pageMarkup, new RegExp(`构建号：${latestUserRelease.build}`));
  assert.match(pageMarkup, /复制链接/);
  assert.match(pageMarkup, /登录普通用户账号/);
  assert.doesNotMatch(pageMarkup, /AI知识库管理后台下载/);
  assert.doesNotMatch(pageMarkup, /ai-knowledge-admin-latest\.(?:apk|exe)/);
  assert.match(pageMarkup, new RegExp(userAndroidApkUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(pageMarkup, new RegExp(userWindowsExeUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(pageMarkup, /\/downloads\/ai-knowledge-chat(?:-latest)?\.apk/);
  assert.doesNotMatch(pageMarkup, /\/downloads\/ai-knowledge-chat(?:-latest)?\.exe/);

  const electronMain = readFileSync("electron/main.cjs", "utf8");
  const capacitorConfig = readFileSync("capacitor.config.ts", "utf8");
  const appShell = readFileSync("app-shell/index.html", "utf8");
  const mainActivity = readFileSync("android/app/src/main/java/com/aiknowledge/chat/MainActivity.java", "utf8");
  const androidBuildGradle = readFileSync("android/app/build.gradle", "utf8");
  const loginPage = readFileSync("app/login/page.tsx", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(electronMain, new RegExp(electronUserAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
  assert.match(capacitorConfig, /appName:\s*"小董AI"/);
  assert.match(capacitorConfig, new RegExp(userWebAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(capacitorConfig, new RegExp(userLoginUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(capacitorConfig, /cleartext:\s*true/);
  assert.match(androidBuildGradle, /versionFile\s*=\s*file\("\.\.\/\.\.\/version\.json"\)/);
  assert.match(androidBuildGradle, /versionCode\s+appVersionCode/);
  assert.match(androidBuildGradle, /versionName\s+appVersionName/);
  assert.match(androidBuildGradle, /buildConfig\s+true/);
  assert.doesNotMatch(capacitorConfig, /stately-sawine-1efd4d\.netlify\.app\/ingest/);
  assert.match(appShell, /http:\/\/47\.238\.0\.23\/login\?app=user&next=\/app\/chat/);
  assert.doesNotMatch(appShell, new RegExp(userLoginUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(appShell, /stately-sawine-1efd4d\.netlify\.app\/ingest/);

  assert.match(mainActivity, /APP_ORIGIN\s*=\s*"http:\/\/47\.238\.0\.23"/);
  assert.match(mainActivity, /USER_CHAT_URL\s*=\s*APP_ORIGIN \+ "\/app\/chat"/);
  assert.match(mainActivity, /CookieManager\.getInstance\(\)/);
  assert.match(mainActivity, /clearStaleWebViewState\(webView\)/);
  assert.match(mainActivity, /BuildConfig\.VERSION_NAME/);
  assert.match(mainActivity, /clearCache\(true\)/);
  assert.match(mainActivity, /clearHistory\(\)/);
  assert.match(mainActivity, /removeAllCookies\(null\)/);
  assert.match(mainActivity, /cookieManager\.flush\(\)/);
  assert.match(mainActivity, /setAcceptCookie\(true\)/);
  assert.match(mainActivity, /setAcceptThirdPartyCookies\(webView,\s*true\)/);
  assert.match(mainActivity, /setJavaScriptEnabled\(true\)/);
  assert.match(mainActivity, /setDomStorageEnabled\(true\)/);
  assert.match(mainActivity, /setSupportMultipleWindows\(true\)/);
  assert.match(mainActivity, /setJavaScriptCanOpenWindowsAutomatically\(true\)/);
  assert.match(mainActivity, /setDatabaseEnabled\(true\)/);
  assert.match(mainActivity, /setAllowFileAccess\(true\)/);
  assert.match(mainActivity, /setAllowContentAccess\(true\)/);
  assert.match(mainActivity, /setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(mainActivity, /setWebChromeClient\(new AppWebChromeClient\(getBridge\(\)\)\)/);
  assert.match(mainActivity, /extends BridgeWebChromeClient/);
  assert.match(mainActivity, /addJavascriptInterface\(new AndroidBridge\(\),\s*"AndroidBridge"\)/);
  assert.match(mainActivity, /@JavascriptInterface/);
  assert.match(mainActivity, /public void openUrl\(String url\)/);
  assert.match(mainActivity, /onCreateWindow/);
  assert.match(mainActivity, /Intent\.ACTION_VIEW/);
  assert.match(mainActivity, /Intent\.CATEGORY_BROWSABLE/);
  assert.match(mainActivity, /startActivity\(intent\)/);
  assert.match(mainActivity, /shouldOpenInExternalBrowser/);
  assert.match(mainActivity, /openExternalBrowser\(url\);\s*return true;/);
  assert.match(mainActivity, /openExternalBrowser\(uri\);\s*return true;/);
  assert.match(mainActivity, /onShowFileChooser/);
  assert.match(mainActivity, /fileChooserParams\.isCaptureEnabled\(\)/);
  assert.match(mainActivity, /super\.onShowFileChooser\(webView,\s*filePathCallback,\s*fileChooserParams\)/);
  assert.match(mainActivity, /Intent\.ACTION_OPEN_DOCUMENT/);
  assert.match(mainActivity, /Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(mainActivity, /Intent\.EXTRA_MIME_TYPES/);
  assert.match(mainActivity, /Intent\.EXTRA_ALLOW_MULTIPLE/);
  assert.match(mainActivity, /ValueCallback<Uri\[]>/);
  assert.match(mainActivity, /onActivityResult/);
  assert.match(mainActivity, /"image\/\*"/);
  assert.match(mainActivity, /"text\/markdown"/);
  assert.match(mainActivity, /application\/vnd\.ms-powerpoint/);
  assert.match(mainActivity, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.doesNotMatch(mainActivity, /WebStorage\.getInstance\(\)\.deleteAllData/);
  assert.match(mainActivity, /path\.equals\("\/ingest"\)/);
  assert.match(mainActivity, /path\.equals\("\/admin"\)/);
  assert.match(mainActivity, /path\.equals\("\/api\/admin"\)/);
  assert.match(mainActivity, /__aiUserAppRouteGuardInstalled/);
  assert.match(mainActivity, /history\.pushState/);

  assert.match(loginPage, /fetch\("\/api\/auth\/me"/);
  assert.match(loginPage, /正在检查登录状态/);
  assert.match(loginPage, /getPostLoginPath/);
  assert.match(loginPage, /!input\.licenseActivated/);
  assert.match(loginPage, /return "\/unlock"/);

  assert.equal(packageJson.scripts["app:android"], "powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1");
  assert.equal(packageJson.scripts["app:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-windows-exe.ps1");
  assert.equal(packageJson.scripts["apk:build"], "node scripts/build-user-android.mjs");
  assert.equal(packageJson.build.appId, "com.aiknowledge.chat.desktop");
  assert.match(packageJson.build.productName, /AI/);

  assert.equal(latestUserRelease.apk_url, userAndroidApkUrl);
  assert.equal(latestUserRelease.version, versionInfo.version);
  assert.equal(latestUserRelease.build, versionInfo.build);
  assert.equal(latestUserRelease.exe_url, userWindowsExeUrl);
  assert.match(latestUserRelease.apk_url, new RegExp(`/releases/download/${versionInfo.version.replace(/\./g, "\\.")}/ai-knowledge-chat-latest\\.apk$`));
  assert.match(latestUserRelease.exe_url, new RegExp(`/releases/download/${versionInfo.version.replace(/\./g, "\\.")}/ai-knowledge-chat-latest\\.exe$`));
  assert.match(latestUserRelease.download_page, /\/download$/);

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
