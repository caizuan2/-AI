import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceSource = readFileSync("lib/super-admin/services/license-admin.service.ts", "utf8");

assert.match(serviceSource, /LICENSE_SEARCH_IGNORABLE_CHARACTERS/);
assert.match(serviceSource, /getAcceptedLicenseHashes\(normalizedLicenseKey\)/);
assert.match(serviceSource, /LEGACY_DEFAULT_LICENSE_SECRET = "aikb-license-v1-default-secret"/);
assert.match(serviceSource, /getLegacyDefaultLicenseHash\(normalizedLicenseKey\)/);
assert.match(serviceSource, /findLicenseByEncryptedKey\(normalizedLicenseKey\)/);
assert.match(serviceSource, /decryptLicenseKey\(license\.encryptedKey\)/);
assert.match(serviceSource, /timingSafeEqual\(leftBuffer, rightBuffer\)/);
assert.match(serviceSource, /应用归属与当前卡密列表不一致/);
assert.doesNotMatch(
  serviceSource,
  /console\.(?:log|info|warn|error)\([^\n]*normalizedLicenseKey/,
  "安全诊断日志不得输出卡密明文"
);

console.log("super admin license search tests passed");
