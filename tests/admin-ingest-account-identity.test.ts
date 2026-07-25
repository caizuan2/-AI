import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveIngestAccountIdentityLabel } from "@/components/enterprise-admin/IngestSettingsPanel";

function testUserCardIdentity() {
  assert.equal(resolveIngestAccountIdentityLabel("chat_only"), "VIP会员");
}

function testFullIngestIdentity() {
  assert.equal(resolveIngestAccountIdentityLabel("full_ingest"), "投喂GLY");
  assert.equal(resolveIngestAccountIdentityLabel("none"), "未激活");
}

function testRegisteredAccountComesFromAuthenticatedPage() {
  const pageSource = readFileSync("app/admin-ingest/page.tsx", "utf8");
  const modeSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const settingsSource = readFileSync("components/enterprise-admin/IngestSettingsPanel.tsx", "utf8");

  assert.match(pageSource, /registeredAccount=\{user\.phone\}/);
  assert.match(modeSource, /registeredAccount=\{registeredAccount\}/);
  assert.match(settingsSource, /注册账号：\{normalizedRegisteredAccount\}/);
  assert.doesNotMatch(settingsSource, /当前投喂端账号/);
  assert.doesNotMatch(settingsSource, />\s*投喂管理员\s*</);
}

testUserCardIdentity();
testFullIngestIdentity();
testRegisteredAccountComesFromAuthenticatedPage();

console.log("admin ingest account identity tests passed");
