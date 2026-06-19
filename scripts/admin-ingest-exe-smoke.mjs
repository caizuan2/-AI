#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const electronMainPath = path.join(root, "electron", "admin-ingest", "main.js");
const expectedPath = "/admin-ingest";
const expectedQuery = "app=ingest-admin&platform=exe";

function fail(message, detail) {
  console.error("❌ admin-ingest EXE smoke failed");
  console.error(message);

  if (detail) {
    console.error(detail);
  }

  process.exit(1);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`无法读取 ${filePath}`, error instanceof Error ? error.message : String(error));
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`无法读取 ${filePath}`, error instanceof Error ? error.message : String(error));
  }
}

function assertNoUserClientLaunchConfig(source) {
  const unsafePatterns = [
    /DEFAULT_ADMIN_INGEST_URL\s*=\s*["'][^"']*\/chat-ui/i,
    /DEFAULT_ADMIN_INGEST_URL\s*=\s*["'][^"']*app=user/i,
    /ADMIN_INGEST_APP_URL[^;\n]*\/chat-ui/i,
    /ADMIN_INGEST_APP_URL[^;\n]*app=user/i,
    /loadURL\([^)]*\/chat-ui/i,
    /loadURL\([^)]*app=user/i
  ];

  for (const pattern of unsafePatterns) {
    if (pattern.test(source)) {
      fail("Electron shell 存在用户端加载配置。", String(pattern));
    }
  }
}

const packageJson = readJson(packageJsonPath);
const scripts = packageJson.scripts || {};

if (scripts["admin-ingest:desktop:dev"] !== "electron electron/admin-ingest/main.js") {
  fail("package.json 缺少 admin-ingest:desktop:dev，或脚本指向不正确。");
}

if (!fs.existsSync(electronMainPath)) {
  fail("缺少 electron/admin-ingest/main.js。");
}

const mainSource = readText(electronMainPath);

if (!mainSource.includes(expectedPath)) {
  fail("electron/admin-ingest/main.js 未包含 /admin-ingest。");
}

if (!mainSource.includes("platform=exe")) {
  fail("electron/admin-ingest/main.js 未包含 platform=exe。");
}

if (!mainSource.includes(expectedQuery)) {
  fail(`ADMIN_INGEST_APP_URL 示例必须包含 ${expectedQuery}。`);
}

assertNoUserClientLaunchConfig(mainSource);

ok("admin-ingest Electron shell config ok");
ok("not user client");
ok("not /chat-ui");
ok("platform=exe");
