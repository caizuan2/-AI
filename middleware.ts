import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logger, getRequestIdFromHeaders, REQUEST_ID_HEADER } from "@/lib/logger";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const apiRateLimitBuckets = new Map<string, RateLimitBucket>();

const apiRateLimitRules = [
  { prefix: "/api/auth", limit: 20, windowMs: 60_000 },
  { prefix: "/api/upload", limit: 8, windowMs: 60_000 },
  { prefix: "/api/knowledge/import", limit: 6, windowMs: 60_000 },
  { prefix: "/api/knowledge/export", limit: 20, windowMs: 60_000 },
  { prefix: "/api/ingest/analyze", limit: 20, windowMs: 60_000 },
  { prefix: "/api/chat", limit: 30, windowMs: 60_000 },
  { prefix: "/api/search", limit: 40, windowMs: 60_000 },
  { prefix: "/api/jobs", limit: 20, windowMs: 60_000 },
  { prefix: "/api", limit: 120, windowMs: 60_000 }
];

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");

  return response;
}

function getClientAddress(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || vercelForwardedFor || realIp || "unknown";
}

function getRateLimitRule(pathname: string) {
  return apiRateLimitRules.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
}

function pruneExpiredBuckets(now: number) {
  if (apiRateLimitBuckets.size < 1000) {
    return;
  }

  apiRateLimitBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      apiRateLimitBuckets.delete(key);
    }
  });
}

function rateLimitApiRequest(request: NextRequest) {
  const rule = getRateLimitRule(request.nextUrl.pathname);

  if (!rule) {
    return null;
  }

  const now = Date.now();
  const clientAddress = getClientAddress(request);
  const key = `${clientAddress}:${rule.prefix}`;
  const bucket = apiRateLimitBuckets.get(key);

  pruneExpiredBuckets(now);

  if (!bucket || bucket.resetAt <= now) {
    apiRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + rule.windowMs
    });
    return null;
  }

  bucket.count += 1;

  if (bucket.count <= rule.limit) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试。"
      }
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );

  return withSecurityHeaders(response);
}

export async function middleware(request: NextRequest) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    logger.info("api.request", {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      queryKeys: Array.from(request.nextUrl.searchParams.keys()).sort(),
      hasForwardedFor: Boolean(
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-vercel-forwarded-for")
      )
    });

    const limitedResponse = rateLimitApiRequest(request);

    if (limitedResponse) {
      limitedResponse.headers.set(REQUEST_ID_HEADER, requestId);
      logger.warn("api.rate_limited", {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode: 429
      });

      return limitedResponse;
    }
  }

  const response = withSecurityHeaders(await updateSupabaseSession(request, requestHeaders));

  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
