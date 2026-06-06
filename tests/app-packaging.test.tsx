import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DownloadPage from "../app/download/page";

const userAppUrl = "https://stately-sawine-1efd4d.netlify.app/login";

async function main() {
  const pageMarkup = renderToStaticMarkup(<DownloadPage />);

  assert.match(pageMarkup, /AI知识库助手下载/);
  assert.match(pageMarkup, /Android APK 下载/);
  assert.match(pageMarkup, /Windows EXE 下载/);
  assert.match(pageMarkup, /请先登录账号/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat-latest\.apk/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat-latest\.exe/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat\.apk/);
  assert.match(pageMarkup, /\/downloads\/ai-knowledge-chat\.exe/);

  const electronMain = readFileSync("electron/main.cjs", "utf8");
  const capacitorConfig = readFileSync("capacitor.config.ts", "utf8");
  const appShell = readFileSync("app-shell/index.html", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(electronMain, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(electronMain, /nodeIntegration:\s*false/);
  assert.match(electronMain, /contextIsolation:\s*true/);
  assert.match(electronMain, /sandbox:\s*true/);
  assert.doesNotMatch(electronMain, /\/chat-ui/);
  assert.doesNotMatch(electronMain, /\/ingest/);
  assert.doesNotMatch(electronMain, /\/admin/);

  assert.match(capacitorConfig, /appId:\s*"com\.aiknowledge\.chat"/);
  assert.match(capacitorConfig, /appName:\s*"AI知识库助手"/);
  assert.match(capacitorConfig, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(capacitorConfig, /cleartext:\s*false/);
  assert.doesNotMatch(capacitorConfig, /\/ingest/);
  assert.match(appShell, new RegExp(userAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(appShell, /\/chat-ui/);
  assert.doesNotMatch(appShell, /\/ingest/);

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
