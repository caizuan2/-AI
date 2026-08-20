import "server-only";

import { createHash } from "node:crypto";

interface AdminIngestOcrCacheEntry {
  expiresAt: number;
  value: unknown;
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

export function clearAdminIngestOcrCache() {
  cacheEntries.clear();
}
