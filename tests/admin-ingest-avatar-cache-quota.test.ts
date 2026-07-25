import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_INGEST_AVATAR_CACHE_KEY,
  readAdminIngestAvatarCache,
  writeAdminIngestAvatarCache
} from "@/lib/enterprise/admin-ingest-account-profile-client";

type FakeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function createQuotaStorage(input: {
  initialValue?: string;
  failEveryWrite?: boolean;
  failFirstWrite?: boolean;
}) {
  const values = new Map<string, string>();
  let writeCount = 0;
  const removedKeys: string[] = [];

  if (input.initialValue !== undefined) {
    values.set(ADMIN_INGEST_AVATAR_CACHE_KEY, input.initialValue);
  }

  const storage: FakeStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writeCount += 1;

      if (input.failEveryWrite || (input.failFirstWrite && writeCount === 1)) {
        throw new DOMException(
          "Setting the value of 'admin-ingest-avatar' exceeded the quota.",
          "QuotaExceededError"
        );
      }

      values.set(key, value);
    },
    removeItem(key) {
      removedKeys.push(key);
      values.delete(key);
    }
  };

  return {
    storage,
    removedKeys,
    read: () => values.get(ADMIN_INGEST_AVATAR_CACHE_KEY) ?? ""
  };
}

function testLegacyBase64CacheIsReplaced() {
  const cache = createQuotaStorage({
    initialValue: `data:image/png;base64,${"a".repeat(20_000)}`
  });
  const permanentUrl = "/api/admin/ingest-images/profile-avatar.png";

  assert.equal(writeAdminIngestAvatarCache(cache.storage, permanentUrl), true);
  assert.equal(cache.read(), permanentUrl);
  assert.deepEqual(cache.removedKeys, [ADMIN_INGEST_AVATAR_CACHE_KEY]);
}

function testQuotaFailureRetriesAfterClearingOnlyAvatarCache() {
  const cache = createQuotaStorage({
    initialValue: "/old-avatar.png",
    failFirstWrite: true
  });
  const permanentUrl = "/api/admin/ingest-images/new-avatar.png";

  assert.doesNotThrow(() => {
    assert.equal(writeAdminIngestAvatarCache(cache.storage, permanentUrl), true);
  });
  assert.equal(cache.read(), permanentUrl);
  assert.deepEqual(cache.removedKeys, [ADMIN_INGEST_AVATAR_CACHE_KEY]);
}

function testUnavailableStorageNeverBreaksPermanentSave() {
  const cache = createQuotaStorage({
    initialValue: "/old-avatar.png",
    failEveryWrite: true
  });

  assert.doesNotThrow(() => {
    assert.equal(
      writeAdminIngestAvatarCache(cache.storage, "/api/admin/ingest-images/new-avatar.png"),
      false
    );
  });
  assert.equal(cache.read(), "");
  assert.deepEqual(cache.removedKeys, [ADMIN_INGEST_AVATAR_CACHE_KEY]);
}

function testReadFailureFallsBackToServerHydration() {
  const storage: FakeStorage = {
    getItem() {
      throw new DOMException("Access denied.", "SecurityError");
    },
    setItem() {},
    removeItem() {}
  };

  assert.equal(readAdminIngestAvatarCache(storage), "");
}

function testRawBrowserStorageErrorIsNotRendered() {
  const settingsSource = readFileSync(
    "components/enterprise-admin/IngestSettingsPanel.tsx",
    "utf8"
  );

  assert.match(settingsSource, /浏览器旧缓存空间不足/);
  assert.match(settingsSource, /服务器永久数据不受影响/);
  assert.doesNotMatch(settingsSource, />Failed to execute setItem</);
}

testLegacyBase64CacheIsReplaced();
testQuotaFailureRetriesAfterClearingOnlyAvatarCache();
testUnavailableStorageNeverBreaksPermanentSave();
testReadFailureFallsBackToServerHydration();
testRawBrowserStorageErrorIsNotRendered();

console.log("admin ingest avatar cache quota tests passed");
