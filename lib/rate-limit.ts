import "server-only";

import { prisma } from "@/lib/prisma";
import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  RATE_LIMIT_GLOBAL_PER_MINUTE,
  RATE_LIMIT_PER_USER_PER_MINUTE,
  hasDatabaseUrl
} from "@/lib/server-config";

export interface RateLimitOptions {
  namespace: string;
  limit: number;
  windowMs: number;
  userId?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  scope: "user" | "ip";
}

export interface PersistentRateLimitOptions {
  namespace: string;
  userId?: string;
  limit?: number;
  windowMs?: number;
  globalLimit?: number;
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || vercelForwardedFor || realIp || "unknown";
}

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 2000) {
    return;
  }

  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  });
}

function buildBucketKey(request: Request, options: RateLimitOptions) {
  if (options.userId?.trim()) {
    return {
      key: `user:${options.userId}:${options.namespace}`,
      scope: "user" as const
    };
  }

  return {
    key: `ip:${getClientIp(request)}:${options.namespace}`,
    scope: "ip" as const
  };
}

export function checkRateLimit(request: Request, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const { key, scope } = buildBucketKey(request, options);
  const bucket = buckets.get(key);

  pruneExpiredBuckets(now);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs
    });

    return {
      allowed: true,
      limit: options.limit,
      remaining: Math.max(0, options.limit - 1),
      resetAt: new Date(now + options.windowMs),
      retryAfterSeconds: 0,
      scope
    };
  }

  bucket.count += 1;

  const remaining = Math.max(0, options.limit - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining,
    resetAt: new Date(bucket.resetAt),
    retryAfterSeconds,
    scope
  };
}

function buildPersistentSubject(request: Request, userId?: string) {
  return userId?.trim() ? `user:${userId}` : `ip:${getClientIp(request)}`;
}

function buildWindowBucket(namespace: string, windowMs: number, now: number) {
  const windowStart = Math.floor(now / windowMs) * windowMs;

  return `${namespace}:${windowStart}`;
}

async function incrementPersistentBucket(
  client: Pick<typeof prisma, "rateLimitEvent">,
  subject: string,
  bucket: string,
  resetAt: Date
) {
  return client.rateLimitEvent.upsert({
    where: {
      subject_bucket: {
        subject,
        bucket
      }
    },
    create: {
      subject,
      bucket,
      count: 1,
      resetAt
    },
    update: {
      count: {
        increment: 1
      },
      resetAt
    }
  });
}

export async function checkPersistentRateLimit(
  request: Request,
  options: PersistentRateLimitOptions
): Promise<RateLimitResult> {
  const limit = options.limit ?? RATE_LIMIT_PER_USER_PER_MINUTE;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const resetAt = new Date(Math.floor(now / windowMs) * windowMs + windowMs);
  const subject = buildPersistentSubject(request, options.userId);
  const scope = options.userId ? "user" : "ip";
  const bucket = buildWindowBucket(options.namespace, windowMs, now);

  if (!hasDatabaseUrl()) {
    return checkRateLimit(request, {
      namespace: options.namespace,
      userId: options.userId,
      limit,
      windowMs
    });
  }

  try {
    const { subjectBucket, globalBucket } = await prisma.$transaction(async (tx) => {
      const nextSubjectBucket = await incrementPersistentBucket(tx, subject, bucket, resetAt);
      const nextGlobalBucket = await incrementPersistentBucket(tx, "global", bucket, resetAt);

      return {
        subjectBucket: nextSubjectBucket,
        globalBucket: nextGlobalBucket
      };
    });
    const globalLimit = options.globalLimit ?? RATE_LIMIT_GLOBAL_PER_MINUTE;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
    const allowed = subjectBucket.count <= limit && globalBucket.count <= globalLimit;
    const remaining = Math.max(0, Math.min(limit - subjectBucket.count, globalLimit - globalBucket.count));

    return {
      allowed,
      limit,
      remaining,
      resetAt,
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
      scope
    };
  } catch (error) {
    logger.warn("rate_limit.persistent_failed", {
      namespace: options.namespace,
      error: toSafeErrorLog(error)
    });

    return checkRateLimit(request, {
      namespace: options.namespace,
      userId: options.userId,
      limit,
      windowMs
    });
  }
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
    "X-RateLimit-Scope": result.scope
  };
}
