import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LicenseKeyStatus } from "@prisma/client";
import { resolveRedeemedLicenseReuseState } from "../lib/auth/license";
import {
  getHistoryScopeForUser,
  getLicenseReactivationTarget,
  getLicenseReactivationUrl,
  getPostLoginDestination,
  isIngestProductPath,
  maskAccountPhone,
  normalizeLicenseReactivationAppType
} from "../lib/auth/license-reactivation";

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
      redeemedByUserId: "different-user-id",
      expiresAt: null
    },
    userId,
    now
  ),
  "other_user"
);

assert.equal(normalizeLicenseReactivationAppType("admin"), "ingest_admin");
assert.equal(normalizeLicenseReactivationAppType("XT-USER"), "user_app");
assert.equal(isIngestProductPath("/ingest?tab=history"), true);
assert.equal(isIngestProductPath("/chat-ui"), false);
assert.equal(getLicenseReactivationTarget("ingest_admin", "/ingest?tab=history"), "/ingest?tab=history");
assert.equal(getLicenseReactivationTarget("ingest_admin", "/chat-ui"), "/ingest");
assert.equal(getLicenseReactivationTarget("user_app", "https://attacker.example"), "/");
assert.equal(
  getLicenseReactivationUrl("ingest_admin", "/ingest", "expired"),
  "/unlock?app=ingest_admin&next=%2Fingest&reason=expired"
);
assert.equal(
  getPostLoginDestination({
    nextPath: "/ingest",
    licenseActivated: false
  }),
  "/unlock?app=ingest_admin&next=%2Fingest&reason=missing"
);
assert.equal(
  getPostLoginDestination({
    nextPath: "/ingest",
    licenseActivated: true
  }),
  "/ingest"
);
assert.equal(maskAccountPhone("13812345678"), "138****5678");
assert.equal(getHistoryScopeForUser(userId), userId);

const activationRoute = readFileSync("app/api/activate/route.ts", "utf8");
const loginPage = readFileSync("app/login/page.tsx", "utf8");
const workspaceLayout = readFileSync("app/(workspace)/layout.tsx", "utf8");
const unlockPanel = readFileSync("app/unlock/unlock-panel.tsx", "utf8");
const licenseCore = readFileSync("lib/auth/license.ts", "utf8");

assert.match(activationRoute, /await checkUserLicense\(originalUserId, input\.appType\)/);
assert.match(activationRoute, /redeemedUser\.id !== originalUserId/);
assert.match(activationRoute, /historyScope: originalHistoryScope/);
assert.match(activationRoute, /user\.licenseActivated \|\| await hasUserRedeemedLicenseHistory\(originalUserId\)/);
assert.match(unlockPanel, /data\.historyScope !== user\.historyScope/);
assert.match(unlockPanel, /LICENSE_REACTIVATION_EVENT_KEY/);
assert.doesNotMatch(unlockPanel, /aikb_license_code/);
assert.match(loginPage, /请登录原手机号账号后更换卡密，不要重新注册/);
assert.match(workspaceLayout, /PRODUCT_ACCESS_HEADER/);
assert.match(workspaceLayout, /getLicenseReactivationUrl\("ingest_admin", "\/ingest", "missing"\)/);
assert.match(licenseCore, /same_user_retry_expired/);
assert.match(licenseCore, /账号已禁用，不能通过更换卡密恢复/);
assert.doesNotMatch(licenseCore, /\.licenseKey\.delete/);

console.log("license reactivation tests passed");
