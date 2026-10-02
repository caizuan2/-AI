import "server-only";

import { createHash } from "node:crypto";

interface AdminIngestOcrCacheEntry {
  expiresAt: number;
  value: unknown;
}

interface AdminIngestOcrFlight {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
  settled: boolean;
}

interface BuildAdminIngestOcrCacheKeyInput {
  accountScope: string;
  bytes: Uint8Array;
  variant: string;
  pipelineVersion: string;
}

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_CACHE_MAX_ENTRIES = 32;
const cacheEntries = new Map<string, AdminIngestOcrCacheEntry>();
const inFlightParses = new Map<string, AdminIngestOcrFlight>();

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.floor(parsed)))
    : fallback;
}

function cloneCacheValue<T>(value: T): T {
  return structuredClone(value);
}

function deleteExpiredEntries(now: number) {
  cacheEntries.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      cacheEntries.delete(key);
    }
  });
}

function enforceCacheLimit() {
  const maxEntries = readBoundedIntegerEnv(
    "ADMIN_INGEST_OCR_CACHE_MAX_ENTRIES",
    DEFAULT_CACHE_MAX_ENTRIES,
    1,
    128
  );

  while (cacheEntries.size > maxEntries) {
    const oldestKey = cacheEntries.keys().next().value as string | undefined;

    if (!oldestKey) {
      return;
    }

    cacheEntries.delete(oldestKey);
  }
}

export function buildAdminIngestOcrCacheKey(input: BuildAdminIngestOcrCacheKeyInput) {
  return createHash("sha256")
    .update(input.accountScope)
    .update("\0")
    .update(input.variant)
    .update("\0")
    .update(input.pipelineVersion)
    .update("\0")
    .update(input.bytes)
    .digest("hex");
}

export function readAdminIngestOcrCache<T>(key: string, now = Date.now()): T | null {
  deleteExpiredEntries(now);
  const entry = cacheEntries.get(key);

  if (!entry) {
    return null;
  }

  cacheEntries.delete(key);
  cacheEntries.set(key, entry);
  return cloneCacheValue(entry.value as T);
}

export function writeAdminIngestOcrCache<T>(key: string, value: T, now = Date.now()) {
  const ttlMs = readBoundedIntegerEnv(
    "ADMIN_INGEST_OCR_CACHE_TTL_MS",
    DEFAULT_CACHE_TTL_MS,
    1_000,
    60 * 60 * 1_000
  );

  deleteExpiredEntries(now);
  cacheEntries.delete(key);
  cacheEntries.set(key, {
    expiresAt: now + ttlMs,
    value: cloneCacheValue(value)
  });
  enforceCacheLimit();
}

function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

export function runAdminIngestOcrSingleFlight<T>(input: {
  key: string;
  signal?: AbortSignal;
  parse: (signal: AbortSignal) => Promise<T>;
  canCache: (value: T) => boolean;
}): Promise<T> {
  if (input.signal?.aborted) {
    return Promise.reject(abortError(input.signal));
  }

  let flight = inFlightParses.get(input.key);
  if (!flight) {
    const created: AdminIngestOcrFlight = {
      controller: new AbortController(),
      promise: Promise.resolve(),
      subscribers: 0,
      settled: false
    };
    // The producer owns its signal; cancelling its first caller must not abort
    // another caller still waiting for the same account-scoped image result.
    created.promise = Promise.resolve()
      .then(() => {
        if (created.controller.signal.aborted) throw abortError(created.controller.signal);
        return input.parse(created.controller.signal);
      })
      .then((value) => {
        if (created.controller.signal.aborted) throw abortError(created.controller.signal);
        if (input.canCache(value)) writeAdminIngestOcrCache(input.key, value);
        return value;
      })
      .finally(() => {
        created.settled = true;
        if (inFlightParses.get(input.key) === created) inFlightParses.delete(input.key);
      });
    inFlightParses.set(input.key, created);
    flight = created;
  }

  const shared = flight;
  shared.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      input.signal?.removeEventListener("abort", onAbort);
      shared.subscribers -= 1;
      if (shared.subscribers === 0 && !shared.settled) {
        shared.controller.abort();
        // A fresh caller must not join a producer whose callers all cancelled.
        if (inFlightParses.get(input.key) === shared) inFlightParses.delete(input.key);
      }
    };
    const onAbort = () => {
      finish();
      reject(abortError(input.signal!));
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    shared.promise.then((value) => {
      if (finished) return;
      try {
        const result = cloneCacheValue(value as T);
        finish();
        resolve(result);
      } catch (error) {
        finish();
        reject(error);
      }
    }, (error: unknown) => {
      if (finished) return;
      finish();
      reject(error);
    });
  });
}

export function clearAdminIngestOcrCache() {
  cacheEntries.clear();
  inFlightParses.forEach((flight) => flight.controller.abort());
  inFlightParses.clear();
}
