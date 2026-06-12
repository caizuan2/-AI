import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminDownloadPage from "../app/admin-download/page";
import latestRelease from "../public/releases/latest.json";

const adminAppUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest";
const userCapacitorAppUrl = "https://stately-sawine-1efd4d.netlify.app/chat-ui";
const userElectronAppUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui";

async function main() {
  const pageMarkup = renderToStaticMarkup(<AdminDownloadPage />);
  const escapedAdminVersion = latestRelease.admin.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  assert.match(pageMarkup, /AI知识库管理后台下载/);
  assert.match(pageMarkup, /仅供授权管理员使用/);
  assert.match(pageMarkup, new RegExp(`最新版本 ${escapedAdminVersion}`));
  assert.match(pageMarkup, new RegExp(`构建号：${latestRelease.admin.build}`));
  assert.match(pageMarkup, /复制链接/);
  assert.match(pageMarkup, /https:\/\/stately-sawine-1efd4d\.netlify\.app\/downloads\/admin\/ai-knowledge-admin-latest\.apk/);
  assert.match(pageMarkup, /\/ingest/);
  assert.doesNotMatch(pageMarkup, /ai-knowledge-chat-latest/);

  const adminCapacitorConfig = readFileSync("capacitor.admin.config.ts", "utf8");
  assert.match(adminCapacitorConfig, /appId:\s*"com\.aiknowledge\.admin"/);
  assert.match(adminCapacitorConfig, /appName:\s*"AI知识库管理后台"/);
  assert.match(adminCapacitorConfig, new RegExp(adminAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(adminCapacitorConfig, /login\?app=user/);
  assert.doesNotMatch(adminCapacitorConfig, /next=\/chat-ui/);

  const adminAppShell = readFileSync("admin-app-shell/index.html", "utf8");
  assert.match(adminAppShell, /login\?app=admin&amp;next=\/ingest/);
  assert.match(adminAppShell, /login\?app=admin&next=\/ingest/);
  assert.doesNotMatch(adminAppShell, /chat-ui/);

  const adminElectronMain = readFileSync("electron-admin/main.cjs", "utf8");
  assert.match(adminElectronMain, new RegExp(adminAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(adminElectronMain, /title:\s*"AI知识库管理后台"/);
  assert.match(adminElectronMain, /width:\s*1280/);
  assert.match(adminElectronMain, /height:\s*860/);
  assert.match(adminElectronMain, /nodeIntegration:\s*false/);
  assert.match(adminElectronMain, /contextIsolation:\s*true/);
  assert.match(adminElectronMain, /sandbox:\s*true/);
  assert.match(adminElectronMain, /ADMIN_INGEST_URL\s*=\s*"https:\/\/stately-sawine-1efd4d\.netlify\.app\/ingest"/);
  assert.match(adminElectronMain, /function isForbiddenAdminAppUrl/);
  assert.match(adminElectronMain, /url\.searchParams\.get\("app"\)\s*===\s*"user"/);
  assert.match(adminElectronMain, /blockedPrefixes\s*=\s*\["\/chat-ui",\s*"\/download"\]/);
  assert.match(adminElectronMain, /url\.pathname\s*===\s*"\/user-download\.html"/);
  assert.match(adminElectronMain, /did-navigate-in-page/);
  assert.match(adminElectronMain, /mainWindow\.loadURL\(ADMIN_INGEST_URL\)/);
  assert.doesNotMatch(adminElectronMain, /loadURL\([^)]*chat-ui/);
  const adminElectronGuard = adminElectronMain.slice(
    adminElectronMain.indexOf("function isForbiddenAdminAppUrl"),
    adminElectronMain.indexOf("function openExternalUrl")
  );
  assert.doesNotMatch(adminElectronGuard, /\/ingest/);
  assert.doesNotMatch(adminElectronGuard, /\/api\/admin/);

  const androidMainActivity = readFileSync("android/app/src/main/java/com/aiknowledge/chat/MainActivity.java", "utf8");
  assert.match(androidMainActivity, /ADMIN_APP_PACKAGE\s*=\s*"com\.aiknowledge\.admin"/);
  assert.match(androidMainActivity, /ADMIN_INGEST_URL\s*=\s*APP_ORIGIN \+ "\/ingest"/);
  assert.match(androidMainActivity, /isAdminShell\(\)/);
  assert.match(androidMainActivity, /isForbiddenAdminRoute/);
  assert.match(androidMainActivity, /getQueryParameter\("app"\)/);
  assert.match(androidMainActivity, /"user"\.equals\(appMode\)/);
  assert.match(androidMainActivity, /path\.equals\("\/chat-ui"\)/);
  assert.match(androidMainActivity, /path\.equals\("\/download"\)/);
  assert.match(androidMainActivity, /path\.equals\("\/user-download\.html"\)/);
  assert.match(androidMainActivity, /adminShell && isForbiddenAdminRoute/);
  assert.match(androidMainActivity, /!adminShell && isForbiddenUserRoute/);
  assert.match(androidMainActivity, /__aiAdminAppRouteGuardInstalled/);
  const androidAdminGuard = androidMainActivity.slice(
    androidMainActivity.indexOf("private static boolean isForbiddenAdminRoute"),
    androidMainActivity.indexOf("private static class AppRouteWebViewClient")
  );
  assert.doesNotMatch(androidAdminGuard, /\/ingest/);
  assert.doesNotMatch(androidAdminGuard, /\/api\/admin/);

  const adminBuilderConfig = readFileSync("electron-builder.admin.yml", "utf8");
  assert.match(adminBuilderConfig, /appId:\s*com\.aiknowledge\.admin\.desktop/);
  assert.match(adminBuilderConfig, /productName:\s*AI知识库管理后台/);
  assert.match(adminBuilderConfig, /output:\s*dist-app\/admin-windows/);
  assert.match(adminBuilderConfig, /main:\s*electron-admin\/main\.cjs/);
  assert.match(adminBuilderConfig, /artifactName:\s*ai-knowledge-admin\.\$\{ext\}/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["admin:android"], "powershell -ExecutionPolicy Bypass -File scripts/build-admin-android-apk.ps1");
  assert.equal(packageJson.scripts["admin:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-admin-windows-exe.ps1");
  assert.equal(packageJson.scripts["admin:copy-installers"], "powershell -ExecutionPolicy Bypass -File scripts/copy-admin-installers-to-public.ps1");

  assert.match(latestRelease.admin.apk_url, /\/downloads\/admin\/ai-knowledge-admin-latest\.apk$/);
  assert.match(latestRelease.admin.download_page, /\/admin-download\.html$/);

  const userCapacitorConfig = readFileSync("capacitor.config.ts", "utf8");
  const userElectronMain = readFileSync("electron/main.cjs", "utf8");
  assert.match(userCapacitorConfig, new RegExp(userCapacitorAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(userElectronMain, new RegExp(userElectronAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const loginPage = readFileSync("app/login/page.tsx", "utf8");
  assert.match(loginPage, /searchParams\.get\("next"\)/);
  assert.match(loginPage, /getSafeNextPath/);
  assert.match(loginPage, /router\.replace\(nextPath \|\| \(data\.licenseActivated \? "\/ingest" : "\/unlock"\)\)/);

  const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(prismaSchema, /ai-knowledge-admin|ADMIN_APP_URL|com\.aiknowledge\.admin/);
  if (existsSync("prisma/migrations")) {
    const adminPackagingMigrations = readdirSync("prisma/migrations").filter((name) =>
      /admin.*packaging|packaging.*admin|admin.*installer|installer.*admin/i.test(name)
    );
    assert.deepEqual(adminPackagingMigrations, []);
  }

  console.log("Admin app packaging tests passed.");
}

void main();
