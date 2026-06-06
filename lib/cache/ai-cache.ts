import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger, toSafeErrorLog } from "@/lib/logger";
import { RAG_CACHE_TTL_SECONDS, hasDatabaseUrl } from "@/lib/server-config";

export interface CacheKeyParts {
  userId: string;
  namespace: "rag-answer" | "embedding";
  provider: string;
  model: string;
  topK?: number;
  corpusVersion?: string;
  input: string;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildAiCacheKey(parts: CacheKeyParts) {
  return [
    parts.namespace,
    parts.userId,
    parts.provider,
    parts.model,
    parts.topK ?? "-",
    parts.corpusVersion ?? "-",
    sha256(parts.input.trim().toLowerCase())
  ].join(":");
}

export async function getAiCacheValue<T>(cacheKey: string, requestId?: string): Promise<T | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  try {
    const cached = await prisma.aiCache.findUnique({
      where: { cacheKey }
    });

    if (!cached) {
      return null;
    }

    if (cached.expiresAt.getTime() <= Date.now()) {
      await prisma.aiCache.delete({
        where: { cacheKey }
      }).catch(() => undefined);
      return null;
    }

    return cached.value as T;
  } catch (error) {
    logger.warn("ai.cache_get_failed", {
      requestId,
      error: toSafeErrorLog(error)
    });
    return null;
  }
}

export async function setAiCacheValue(
  cacheKey: string,
  value: unknown,
  options: {
    ttlSeconds?: number;
    requestId?: string;
  } = {}
) {
  if (!hasDatabaseUrl()) {
    return;
  }

  const ttlSeconds = options.ttlSeconds ?? RAG_CACHE_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const jsonValue = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

  try {
    await prisma.aiCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        value: jsonValue,
        expiresAt
      },
      update: {
        value: jsonValue,
        expiresAt
      }
    });
  } catch (error) {
    logger.warn("ai.cache_set_failed", {
      requestId: options.requestId,
      error: toSafeErrorLog(error)
    });
  }
}

export async function getCorpusVersion(userId: string) {
  if (!hasDatabaseUrl()) {
    return "no-db";
  }

  const latest = await prisma.knowledgeItem.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true }
  });

  return latest?.updatedAt.toISOString() ?? "empty";
}
