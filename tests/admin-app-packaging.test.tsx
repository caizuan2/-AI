import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminDownloadPage from "../app/admin-download/page";

const adminAppUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest";
const userAppUrl = "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui";

async function main() {
  const pageMarkup = renderToStaticMarkup(<AdminDownloadPage />);

  assert.match(pageMarkup, /AI知识库管理后台下载/);
  assert.match(pageMarkup, /仅供授权管理员使用/);
  assert.match(pageMarkup, /\/downloads\/admin\/ai-knowledge-admin-latest\.apk/);
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
  assert.doesNotMatch(adminElectronMain, /loadURL\([^)]*chat-ui/);

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

  const userCapacitorConfig = readFileSync("capacitor.config.ts", "utf8");
  const userElectronMain = readFileSync("electron/main.cjs", "utf8");
  assert.match(userCapacitorConfig, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(userElectronMain, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

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
