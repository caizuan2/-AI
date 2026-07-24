import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IngestLicenseInvalidDialog } from "@/components/enterprise-admin/IngestLicenseInvalidGate";
import { readApiErrorCode } from "@/lib/api/client";
import {
  createIngestLicenseGuardedFetch,
  INGEST_LICENSE_CHECK_INTERVAL_MS,
  isBlockedIngestBusinessRequest,
  readIngestLicenseSignal,
  startIngestLicenseStatusMonitor,
  type IngestLicenseInvalidCode
} from "@/lib/enterprise/ingest-license-invalid";

const baseOrigin = "https://ingest.example.com";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function testSignalParsing() {
  assert.equal(readIngestLicenseSignal({
    responseStatus: 403,
    requestPath: "/api/admin/kb/ingest/gpt",
    payload: { code: "LICENSE_DISABLED" }
  }), "LICENSE_DISABLED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 403,
    requestPath: "/api/admin/kb/save",
    payload: { error: { code: "LICENSE_EXPIRED" } }
  }), "LICENSE_EXPIRED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 403,
    requestPath: "/api/core/ingest",
    payload: { error: { code: "LICENSE_DISABLED" } }
  }), "LICENSE_DISABLED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 403,
    requestPath: "/api/ingest/analyze",
    payload: { errorCode: "LICENSE_EXPIRED" }
  }), "LICENSE_EXPIRED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 200,
    requestPath: "/api/ingest/auth/me",
    payload: { success: true, data: { errorCode: "LICENSE_DISABLED" } }
  }), "LICENSE_DISABLED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 200,
    requestPath: "/api/ingest/auth/me",
    payload: { success: true, data: { license: { status: "expired" } } }
  }), "LICENSE_EXPIRED");

  assert.equal(readIngestLicenseSignal({
    responseStatus: 200,
    requestPath: "/api/license/status",
    payload: { ok: true, data: { license: { status: "expired" } } }
  }), null, "legacy SaaS status must not control the XT-INGEST gate");

  assert.equal(readApiErrorCode({
    success: true,
    data: { errorCode: "LICENSE_DISABLED" }
  }), "LICENSE_DISABLED");

  for (const input of [
    { responseStatus: 403, payload: { code: "FORBIDDEN" } },
    { responseStatus: 401, payload: { code: "LICENSE_DISABLED" } },
    { responseStatus: 500, payload: { code: "LICENSE_DISABLED" } },
    { responseStatus: 200, payload: { code: "LICENSE_DISABLED" } },
    { responseStatus: 403, payload: null }
  ]) {
    assert.equal(readIngestLicenseSignal({
      responseStatus: input.responseStatus,
      requestPath: "/api/admin/kb/ingest/gpt",
      payload: input.payload
    }), null);
  }
}

function testRequestBlockingScope() {
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/admin/kb/ingest/gpt",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/admin/kb/ingest/files/parse",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/admin/kb/save",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/admin/ingest-memory/publish",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/runtime/memory/search",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/core/ingest",
    { method: "POST" },
    baseOrigin
  ), true);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/ingest/analyze",
    { method: "POST" },
    baseOrigin
  ), true);

  assert.equal(isBlockedIngestBusinessRequest(
    "/api/admin/kb/ingest",
    { method: "GET" },
    baseOrigin
  ), false);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/ingest/auth/activate-license",
    { method: "POST" },
    baseOrigin
  ), false);
  assert.equal(isBlockedIngestBusinessRequest(
    "/api/auth/logout",
    { method: "POST" },
    baseOrigin
  ), false);
  assert.equal(isBlockedIngestBusinessRequest(
    "https://other.example.com/api/admin/kb/save",
    { method: "POST" },
    baseOrigin
  ), false);
}

async function testGuardedFetch() {
  let invalidCode: IngestLicenseInvalidCode | null = null;
  let baseCalls = 0;
  let invalidEvents = 0;
  let nextResponse = jsonResponse({ ok: false, code: "LICENSE_DISABLED" }, 403);
  const baseFetch = (async () => {
    baseCalls += 1;
    return nextResponse;
  }) as typeof fetch;
  const guardedFetch = createIngestLicenseGuardedFetch({
    fetch: baseFetch,
    baseOrigin,
    getInvalidCode: () => invalidCode,
    onInvalid: (code) => {
      invalidEvents += 1;
      invalidCode = code;
    }
  });

  const firstResponse = await guardedFetch("/api/admin/kb/ingest/gpt", { method: "POST" });
  assert.equal(firstResponse.status, 403);
  assert.equal(invalidCode, "LICENSE_DISABLED");
  assert.equal(invalidEvents, 1);
  assert.equal(baseCalls, 1);

  const blockedResponse = await guardedFetch("/api/admin/kb/ingest/files/parse", { method: "POST" });
  assert.equal(blockedResponse.status, 403);
  assert.equal((await blockedResponse.json() as { code: string }).code, "LICENSE_DISABLED");
  assert.equal(baseCalls, 1, "locked ingest/upload requests must not reach the underlying fetch");

  nextResponse = jsonResponse({ success: true, data: { hasIngestAccess: true } });
  const statusResponse = await guardedFetch("/api/ingest/auth/me?licenseCheck=1", {
    method: "GET"
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(invalidCode, "LICENSE_DISABLED", "invalid state must stay latched until navigation");
  assert.equal(baseCalls, 2, "license status checks must remain available while locked");

  nextResponse = jsonResponse({ ok: true, data: {} });
  await guardedFetch("/api/admin/kb/save", { method: "POST" });
  assert.equal(baseCalls, 2, "an active-looking response must not silently unlock business writes");
}

async function testNoFalsePositiveOnFailures() {
  let invalidEvents = 0;
  const serverFailureFetch = (async () => jsonResponse({
    ok: false,
    code: "LICENSE_DISABLED"
  }, 500)) as typeof fetch;
  const guardedServerFailureFetch = createIngestLicenseGuardedFetch({
    fetch: serverFailureFetch,
    baseOrigin,
    getInvalidCode: () => null,
    onInvalid: () => {
      invalidEvents += 1;
    }
  });

  await guardedServerFailureFetch("/api/admin/kb/ingest/gpt", { method: "POST" });
  assert.equal(invalidEvents, 0);

  const networkFailureFetch = (async () => {
    throw new TypeError("network unavailable");
  }) as typeof fetch;
  const guardedNetworkFailureFetch = createIngestLicenseGuardedFetch({
    fetch: networkFailureFetch,
    baseOrigin,
    getInvalidCode: () => null,
    onInvalid: () => {
      invalidEvents += 1;
    }
  });

  await assert.rejects(
    guardedNetworkFailureFetch("/api/admin/kb/ingest/gpt", { method: "POST" }),
    /network unavailable/
  );
  assert.equal(invalidEvents, 0);
}

async function testCrossOriginAndDisabledGuardPassThrough() {
  let invalidEvents = 0;
  let baseCalls = 0;
  let enabled = true;
  const baseFetch = (async () => {
    baseCalls += 1;
    return jsonResponse({ code: "LICENSE_DISABLED" }, 403);
  }) as typeof fetch;
  const guardedFetch = createIngestLicenseGuardedFetch({
    fetch: baseFetch,
    baseOrigin,
    isEnabled: () => enabled,
    getInvalidCode: () => null,
    onInvalid: () => {
      invalidEvents += 1;
    }
  });

  await guardedFetch("https://other.example.com/api/admin/kb/ingest/gpt", { method: "POST" });
  assert.equal(invalidEvents, 0, "cross-origin 403 responses must not trigger the ingest modal");

  enabled = false;
  await guardedFetch("/api/admin/kb/ingest/gpt", { method: "POST" });
  assert.equal(baseCalls, 2, "a cleaned-up guard must remain a transparent pass-through if captured by another wrapper");
  assert.equal(invalidEvents, 0);
}

async function flushMonitor() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testStatusMonitorLifecycle() {
  const listeners: {
    focus?: () => void;
    visibility?: () => void;
    interval?: () => void;
  } = {};
  let intervalMs = 0;
  let clearedInterval = 0;
  let visibilityState = "hidden";
  let checks = 0;
  const cleanup = startIngestLicenseStatusMonitor({
    check: async () => {
      checks += 1;
    },
    windowTarget: {
      addEventListener: (_type, listener) => {
        listeners.focus = listener;
      },
      removeEventListener: (_type, listener) => {
        if (listeners.focus === listener) {
          delete listeners.focus;
        }
      }
    },
    documentTarget: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (_type, listener) => {
        listeners.visibility = listener;
      },
      removeEventListener: (_type, listener) => {
        if (listeners.visibility === listener) {
          delete listeners.visibility;
        }
      }
    },
    setIntervalFn: (handler, value) => {
      listeners.interval = handler;
      intervalMs = value;
      return 41;
    },
    clearIntervalFn: (intervalId) => {
      clearedInterval = intervalId;
    }
  });

  assert.equal(checks, 1, "startup must run an immediate license check");
  assert.equal(intervalMs, 60_000);
  await flushMonitor();

  listeners.focus?.();
  await flushMonitor();
  assert.equal(checks, 2, "window focus must recheck the license");

  listeners.visibility?.();
  await flushMonitor();
  assert.equal(checks, 2, "hidden visibility changes must not recheck");

  visibilityState = "visible";
  listeners.visibility?.();
  await flushMonitor();
  assert.equal(checks, 3, "restoring a visible page must recheck the license");

  listeners.interval?.();
  await flushMonitor();
  assert.equal(checks, 4, "the interval must run the lightweight check");

  cleanup();
  assert.equal(clearedInterval, 41);
  assert.equal(listeners.focus, undefined);
  assert.equal(listeners.visibility, undefined);
}

function testStatusMonitorCleanupAbortsInFlightCheck() {
  const receivedSignal: { current: AbortSignal | null } = { current: null };
  const cleanup = startIngestLicenseStatusMonitor({
    check: (signal) => {
      receivedSignal.current = signal;
      return new Promise(() => undefined);
    },
    windowTarget: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    },
    documentTarget: {
      visibilityState: "visible",
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    },
    setIntervalFn: () => 9,
    clearIntervalFn: () => undefined
  });

  assert.equal(receivedSignal.current?.aborted, false);
  cleanup();
  assert.equal(receivedSignal.current?.aborted, true);
}

function testDialogAndLifecycleWiring() {
  const markup = renderToStaticMarkup(
    <IngestLicenseInvalidDialog onSwitchAccount={() => undefined} />
  );

  assert.match(markup, /role="alertdialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /卡密已失效/);
  assert.match(markup, /知识投喂、上传和资料管理功能已暂停/);
  assert.match(markup, /重新激活/);
  assert.match(markup, /切换账号/);
  assert.match(markup, /href="\/ingest\/activate\?next=%2Fadmin-ingest"/);
  assert.doesNotMatch(markup, /关闭|XT-INGEST-|token|userId/);
  assert.equal((markup.match(/卡密已失效/g) ?? []).length, 1);
  assert.equal(INGEST_LICENSE_CHECK_INTERVAL_MS, 60_000);

  const gateSource = readFileSync(path.join(
    process.cwd(),
    "components/enterprise-admin/IngestLicenseInvalidGate.tsx"
  ), "utf8");
  const layoutSource = readFileSync(path.join(process.cwd(), "app/admin-ingest/layout.tsx"), "utf8");
  const authStatusSource = readFileSync(path.join(process.cwd(), "app/api/ingest/auth/me/route.ts"), "utf8");
  const accessTierSource = readFileSync(path.join(
    process.cwd(),
    "lib/enterprise/ingest-access-tier.ts"
  ), "utf8");

  assert.match(gateSource, /invalidCodeRef\.current === code/);
  assert.match(gateSource, /guardEnabled = false/);
  assert.doesNotMatch(gateSource, /setInput|setUploadedFiles|setMessages|clearDraft/);
  assert.match(layoutSource, /resolveIngestAccessTier/);
  assert.match(layoutSource, /initialLicenseCode = access\.invalidLicenseCode/);
  assert.match(layoutSource, /initialAccessTier=\{initialAccessTier\}/);
  assert.doesNotMatch(layoutSource, /requireKbAdmin/);
  assert.match(authStatusSource, /resolveIngestAccessTier/);
  assert.match(authStatusSource, /hasIngestPortalAccess/);
  assert.match(authStatusSource, /accessTier: access\.accessTier/);
  assert.match(accessTierSource, /LICENSE_DISABLED/);
  assert.match(accessTierSource, /LICENSE_EXPIRED/);
}

async function main() {
  testSignalParsing();
  testRequestBlockingScope();
  await testGuardedFetch();
  await testNoFalsePositiveOnFailures();
  await testCrossOriginAndDisabledGuardPassThrough();
  await testStatusMonitorLifecycle();
  testStatusMonitorCleanupAbortsInFlightCheck();
  testDialogAndLifecycleWiring();
  console.log("admin ingest license invalid gate tests passed");
}

void main();
