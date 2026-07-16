import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkCurrentUserLicense,
  createUserLicenseAwareFetch,
  createUserLicenseGuardStore,
  readInvalidLicenseResponse,
  readInvalidLicenseStatus,
  shouldBlockUserBusinessRequest,
  UserLicenseAccessBlockedError,
  USER_LICENSE_CHECK_INTERVAL_MS
} from "../app/(user)/chat-ui/lib/user-license-guard";

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function main() {
  assert.equal(await readInvalidLicenseResponse(apiResponse({
    success: false,
    code: "LICENSE_DISABLED",
    error: {
      code: "LICENSE_DISABLED",
      message: "卡密已禁用。"
    }
  }, 403)), "disabled");
  assert.equal(await readInvalidLicenseResponse(apiResponse({
    success: false,
    code: "LICENSE_EXPIRED",
    error: {
      code: "LICENSE_EXPIRED",
      message: "卡密已过期。"
    }
  }, 403)), "expired");
  assert.equal(await readInvalidLicenseResponse(apiResponse({
    success: false,
    code: "LICENSE_DISABLED"
  }, 500)), null, "500 responses must never invalidate the license");
  assert.equal(await readInvalidLicenseResponse(apiResponse({
    success: false,
    code: "FORBIDDEN"
  }, 403)), null, "unrelated 403 responses must not invalidate the license");

  assert.equal(await readInvalidLicenseStatus(apiResponse({
    success: true,
    data: {
      license: {
        status: "disabled"
      }
    }
  })), "disabled");
  assert.equal(await readInvalidLicenseStatus(apiResponse({
    success: true,
    data: {
      license: {
        status: "active"
      }
    }
  })), null);

  const store = createUserLicenseGuardStore();
  let notificationCount = 0;
  store.subscribe(() => {
    notificationCount += 1;
  });
  assert.equal(store.markInvalid("disabled"), true);
  assert.equal(store.markInvalid("expired"), false);
  assert.equal(notificationCount, 1, "the global modal state must only open once");
  assert.equal(shouldBlockUserBusinessRequest("/api/ai/chat/ask", store.getSnapshot()), true);
  assert.equal(shouldBlockUserBusinessRequest("/api/ai/chat/attachments", store.getSnapshot()), true);
  assert.equal(shouldBlockUserBusinessRequest("/api/sync/conversations", store.getSnapshot()), true);
  assert.equal(shouldBlockUserBusinessRequest("/api/license/status", store.getSnapshot()), false);
  assert.equal(shouldBlockUserBusinessRequest("/api/auth/logout", store.getSnapshot()), false);
  assert.equal(shouldBlockUserBusinessRequest("/releases/latest.json", store.getSnapshot()), false);

  const interceptedStore = createUserLicenseGuardStore();
  let interceptedRequestCount = 0;
  const interceptedFetch = createUserLicenseAwareFetch(async () => {
    interceptedRequestCount += 1;
    return apiResponse({
      success: false,
      code: "LICENSE_DISABLED",
      error: {
        code: "LICENSE_DISABLED",
        message: "卡密已禁用。"
      }
    }, 403);
  }, interceptedStore);
  await interceptedFetch("/api/ai/chat/conversations");
  assert.deepEqual(interceptedStore.getSnapshot(), {
    invalid: true,
    reason: "disabled"
  });
  await assert.rejects(
    () => interceptedFetch("/api/ai/chat/ask"),
    UserLicenseAccessBlockedError
  );
  assert.equal(interceptedRequestCount, 1, "blocked requests must not reach the API");

  const periodicStore = createUserLicenseGuardStore();
  await checkCurrentUserLicense(async () => apiResponse({
    success: true,
    data: {
      license: {
        status: "expired"
      }
    }
  }), periodicStore);
  assert.deepEqual(periodicStore.getSnapshot(), {
    invalid: true,
    reason: "expired"
  });

  const networkStore = createUserLicenseGuardStore();
  await checkCurrentUserLicense(async () => {
    throw new TypeError("Failed to fetch");
  }, networkStore);
  assert.equal(networkStore.getSnapshot().invalid, false, "network errors must not show the modal");

  const serverErrorStore = createUserLicenseGuardStore();
  await checkCurrentUserLicense(async () => apiResponse({
    success: false,
    code: "DATABASE_ERROR"
  }, 500), serverErrorStore);
  assert.equal(serverErrorStore.getSnapshot().invalid, false, "server errors must not show the modal");
  assert.equal(USER_LICENSE_CHECK_INTERVAL_MS, 60_000);

  const componentSource = readFileSync(
    "app/(user)/chat-ui/components/UserLicenseGuard.tsx",
    "utf8"
  );
  assert.match(componentSource, /卡密已失效/);
  assert.match(componentSource, /用户端 AI 对话和知识库功能已暂停/);
  assert.match(componentSource, /重新激活/);
  assert.match(componentSource, /切换账号/);
  assert.match(componentSource, /onCancel=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(componentSource, /visibilitychange/);
  assert.match(componentSource, /window\.addEventListener\("focus"/);
  assert.match(componentSource, /window\.addEventListener\("pageshow"/);
  assert.match(componentSource, /dialog\.showModal\(\)/);
  assert.doesNotMatch(componentSource, /关闭弹窗|onClick=\{onClose\}/);
  assert.doesNotMatch(componentSource, /licenseKey|userId|\btoken\b/);

  console.log("user license guard tests passed");
}

void main();
