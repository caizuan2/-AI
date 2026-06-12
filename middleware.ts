import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { logger, getRequestIdFromHeaders, REQUEST_ID_HEADER } from "@/lib/logger";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const apiRateLimitBuckets = new Map<string, RateLimitBucket>();

const apiRateLimitRules = [
  { prefix: "/api/auth", limit: 20, windowMs: 60_000 },
  { prefix: "/api/admin/kb", limit: 30, windowMs: 60_000 },
  { prefix: "/api/admin", limit: 40, windowMs: 60_000 },
  { prefix: "/api/upload", limit: 8, windowMs: 60_000 },
  { prefix: "/api/knowledge/import", limit: 6, windowMs: 60_000 },
  { prefix: "/api/knowledge/export", limit: 20, windowMs: 60_000 },
  { prefix: "/api/ingest/analyze", limit: 20, windowMs: 60_000 },
  { prefix: "/api/chat", limit: 30, windowMs: 60_000 },
  { prefix: "/api/search", limit: 40, windowMs: 60_000 },
  { prefix: "/api/jobs", limit: 20, windowMs: 60_000 },
  { prefix: "/api", limit: 120, windowMs: 60_000 }
];

function withSecurityHeaders(response: NextResponse, pathname = "") {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    pathname === "/chat-ui" ? "camera=(self), microphone=(self), geolocation=()" : "camera=(), microphone=(), geolocation=()"
  );
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

function rateLimitApiRequest(request: NextRequest, requestId: string) {
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
      ok: false,
      code: "RATE_LIMITED",
      message: "请求过于频繁，请稍后再试。",
      requestId,
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试。",
        requestId
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

const protectedPagePrefixes = [
  "/",
  "/dashboard",
  "/ingest",
  "/upload",
  "/sources",
  "/knowledge",
  "/chat",
  "/review",
  "/tags",
  "/categories",
  "/settings",
  "/feedback",
  "/admin"
];
const sessionOnlyPagePrefixes = ["/unlock"];
const publicExactPaths = [
  "/login",
  "/register",
  "/api/health",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml"
];
const publicPathPrefixes = [
  "/api/auth",
  "/_next",
  "/static"
];
const staticAssetPattern = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$/i;

function isPathUnder(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => {
    if (prefix === "/") {
      return pathname === "/";
    }

    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function nextWithRequestHeaders(requestHeaders?: Headers) {
  if (requestHeaders) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  return NextResponse.next();
}

function isPublicPath(pathname: string) {
  return publicExactPaths.includes(pathname) || publicPathPrefixes.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function isStaticAsset(pathname: string) {
  return staticAssetPattern.test(pathname);
}

function isSafeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }

  return !isPathUnder(value.split("?")[0] ?? value, ["/login", "/register"]);
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  const currentTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.pathname = "/login";
  loginUrl.search = "";

  if (isSafeNextPath(currentTarget)) {
    loginUrl.searchParams.set("next", currentTarget);
  }

  return NextResponse.redirect(loginUrl);
}

function applyPageAuth(request: NextRequest, requestHeaders: Headers, requestId: string) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    logger.info("auth.redirect_check", {
      requestId,
      pathname,
      hasSessionCookie: Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value),
      sessionValid: null,
      redirectTarget: null,
      reason: "public_path"
    });
    return nextWithRequestHeaders(requestHeaders);
  }

  if (isStaticAsset(pathname)) {
    logger.info("auth.redirect_check", {
      requestId,
      pathname,
      hasSessionCookie: Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value),
      sessionValid: null,
      redirectTarget: null,
      reason: "static_asset"
    });
    return nextWithRequestHeaders(requestHeaders);
  }

  if (pathname.startsWith("/api/")) {
    return nextWithRequestHeaders(requestHeaders);
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const needsSession = isPathUnder(pathname, protectedPagePrefixes) || isPathUnder(pathname, sessionOnlyPagePrefixes);

  if (needsSession && !hasSession) {
    const redirectResponse = redirectToLogin(request);

    logger.warn("auth.redirect_check", {
      requestId,
      pathname,
      hasSessionCookie: false,
      sessionValid: false,
      redirectTarget: redirectResponse.headers.get("location"),
      reason: "unauthenticated"
    });

    return redirectResponse;
  }

  logger.info("auth.redirect_check", {
    requestId,
    pathname,
    hasSessionCookie: hasSession,
    sessionValid: hasSession ? null : false,
    redirectTarget: null,
    reason: hasSession ? "session_cookie_present" : "public_or_unprotected"
  });

  return nextWithRequestHeaders(requestHeaders);
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

    const limitedResponse = rateLimitApiRequest(request, requestId);

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

  const response = withSecurityHeaders(applyPageAuth(request, requestHeaders, requestId), request.nextUrl.pathname);

  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
