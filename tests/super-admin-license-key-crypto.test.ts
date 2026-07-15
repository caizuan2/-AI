import assert from "node:assert/strict";
import {
  decryptLicenseKey,
  encryptLicenseKey,
  LICENSE_KEY_ENCRYPTION_VERSION
} from "../lib/super-admin/license-key-crypto";

const secret = "local-test-license-encryption-secret-32-bytes";
const nextSecret = "local-test-next-license-encryption-secret";
const plainKey = "XT-USER-ABCD-EFGH-JKLM";
const encryptedKey = encryptLicenseKey(plainKey, secret);

assert.match(encryptedKey, new RegExp(`^v${LICENSE_KEY_ENCRYPTION_VERSION}\\.`));
assert.equal(encryptedKey.includes(plainKey), false);
assert.equal(decryptLicenseKey(encryptedKey, [secret]), plainKey);
assert.equal(decryptLicenseKey(encryptedKey, [nextSecret, secret]), plainKey);
assert.throws(() => decryptLicenseKey(encryptedKey, [nextSecret]), /密钥.*不匹配/);

const tamperedKey = `${encryptedKey.slice(0, -1)}${encryptedKey.endsWith("A") ? "B" : "A"}`;
assert.throws(() => decryptLicenseKey(tamperedKey, [secret]), /密文校验失败/);

console.log("super-admin license key crypto tests passed");
