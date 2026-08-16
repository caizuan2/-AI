import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LicenseKeyStatus } from "@prisma/client";
import { resolveRedeemedLicenseReuseState } from "../lib/auth/license-reuse";

const now = new Date("2026-07-25T12:00:00.000Z");
const userId = "original-user-id";

assert.equal(
  resolveRedeemedLicenseReuseState(
    {
      status: LicenseKeyStatus.USED,
      redeemedByUserId: userId,
      expiresAt: new Date("2026-07-26T12:00:00.000Z")
    },
    userId,
    now
  ),
  "active"
);
assert.equal(
  resolveRedeemedLicenseReuseState(
    {
      status: LicenseKeyStatus.USED,
      redeemedByUserId: userId,
      expiresAt: now
    },
    userId,
    now
  ),
  "expired"
);
assert.equal(
  resolveRedeemedLicenseReuseState(
    {
      status: LicenseKeyStatus.DISABLED,
      redeemedByUserId: userId,
      expiresAt: null
    },
    userId,
    now
  ),
  "disabled"
);
assert.equal(
  resolveRedeemedLicenseReuseState(
    {
      status: LicenseKeyStatus.USED,
      redeemedByUserId: "another-user-id",
      expiresAt: null
    },
    userId,
    now
  ),
  "other_user"
);

const licenseCore = readFileSync("lib/auth/license.ts", "utf8");
const activationRoute = readFileSync("app/api/ingest/auth/activate-license/route.ts", "utf8");
const invalidGate = readFileSync("components/enterprise-admin/IngestLicenseInvalidGate.tsx", "utf8");
const authPortal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");
const redeemFunction = licenseCore.slice(licenseCore.indexOf("export async function redeemLicenseKey"));

assert.match(redeemFunction, /reason:\s*"account_disabled"/);
assert.match(redeemFunction, /账号已禁用，不能通过更换卡密恢复/);
assert.match(redeemFunction, /reason:\s*"same_user_retry_expired"/);
assert.match(redeemFunction, /reason:\s*"same_user_retry_disabled"/);
assert.match(redeemFunction, /tx\.user\.updateMany\(\{[\s\S]*?isActive:\s*true/);
assert.doesNotMatch(redeemFunction, /data:\s*\{[\s\S]{0,100}?isActive:\s*true/);
assert.doesNotMatch(redeemFunction, /\.licenseKey\.delete/);

assert.match(activationRoute, /const originalUserId = user\.id/);
assert.match(activationRoute, /createAdminIngestHistoryScope\(originalUserId\)/);
assert.match(activationRoute, /activatedUser\.id !== originalUserId/);
assert.match(activationRoute, /nextHistoryScope !== originalHistoryScope/);
assert.match(activationRoute, /access\.accessTier === "none"/);
assert.match(activationRoute, /permission:\s*access\.accessTier/);
assert.match(activationRoute, /historyScope:\s*nextHistoryScope/);

assert.match(invalidGate, /卡密已过期/);
assert.match(invalidGate, /卡密已禁用/);
assert.match(invalidGate, /使用新卡重新激活/);
assert.match(invalidGate, /INGEST_LICENSE_REACTIVATION_EVENT_KEY/);
assert.match(invalidGate, /window\.addEventListener\("storage"/);
assert.match(invalidGate, /nextTier && nextTier !== accessTierRef\.current[\s\S]*?window\.location\.reload\(\)/);

assert.match(authPortal, /请登录原手机号账号后更换卡密，不要重新注册/);
assert.match(authPortal, /更换卡密不会创建新账号，也不会清除原账号的历史记录和知识资料/);
assert.match(authPortal, /当前原账号：\{maskAccountPhone\(currentAccount\.phone\)\}/);
assert.ok(authPortal.includes(">小董AI<"));
assert.match(authPortal, /如需恢复小董AI，请使用 XT-INGEST 卡密/);
assert.match(authPortal, /新卡密（小董AI请使用 XT-INGEST）/);
assert.doesNotMatch(authPortal, /AI 投喂 SaaS|完整投喂端/);
assert.match(authPortal, /data\.userId !== currentAccount\.id/);
assert.match(authPortal, /!data\.historyScope \|\| !permission \|\| permission === "none"/);
assert.match(authPortal, /window\.localStorage\.setItem/);
assert.match(authPortal, /原账号已恢复，历史记录与知识资料保持不变/);
assert.match(authPortal, /!reactivationRequested \? \(/);

console.log("admin ingest license reactivation tests passed");
