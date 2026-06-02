import "server-only";

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

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
    "X-RateLimit-Scope": result.scope
  };
}
