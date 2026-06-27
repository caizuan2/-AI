import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getProductFromPath } from "@/lib/auth/product";
import { PRODUCT_ACCESS_HEADER } from "@/lib/auth/product-access";
import {
  INGEST_PORTAL_COOKIE_NAME,
  verifyIngestPortalCookieValue
} from "@/lib/enterprise/ingest-portal-cookie";
import { logger, getRequestIdFromHeaders, REQUEST_ID_HEADER } from "@/lib/logger";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const apiRateLimitBuckets = new Map<string, RateLimitBucket>();

const apiRateLimitRules = [
  { prefix: "/api/auth", limit: 20, windowMs: 60_000 },
  { prefix: "/api/ingest/auth", limit: 20, windowMs: 60_000 },
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
  "/app",
  "/chat-ui",
  "/dashboard",
  "/ingest",
  "/admin-ingest",
  "/upload",
  "/sources",
  "/knowledge",
  "/chat",
  "/review",
  "/tags",
  "/categories",
  "/settings",
  "/feedback",
  "/admin",
  "/super-admin"
];
const sessionOnlyPagePrefixes = ["/unlock"];
const publicExactPaths = [
  "/login",
  "/register",
  "/no-access",
  "/ingest/login",
  "/ingest/register",
  "/ingest/activate",
  "/api/health",
  "/api/user/expert-market",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml"
];
const publicPathPrefixes = [
  "/api/auth",
  "/api/ingest/auth",
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

  return !isPathUnder(value.split("?")[0] ?? value, [
    "/login",
    "/register",
    "/ingest/login",
    "/ingest/register",
    "/ingest/activate"
  ]);
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

function redirectToNoAccess(request: NextRequest) {
  const noAccessUrl = request.nextUrl.clone();

  noAccessUrl.pathname = "/no-access";
  noAccessUrl.search = "";

  return NextResponse.redirect(noAccessUrl);
}

function redirectToIngestLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  const currentTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.pathname = "/ingest/login";
  loginUrl.search = "";

  if (isSafeNextPath(currentTarget)) {
    loginUrl.searchParams.set("next", currentTarget);
  }

  return NextResponse.redirect(loginUrl);
}

function redirectToIngestActivate(request: NextRequest) {
  const activateUrl = request.nextUrl.clone();
  const currentTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  activateUrl.pathname = "/ingest/activate";
  activateUrl.search = "";

  if (isSafeNextPath(currentTarget)) {
    activateUrl.searchParams.set("next", currentTarget);
  }

  return NextResponse.redirect(activateUrl);
}

function apiAuthError(code: "UNAUTHORIZED" | "LICENSE_APP_TYPE_MISMATCH", status: 401 | 403, requestId: string) {
  const message = code === "UNAUTHORIZED" ? "请先登录后再继续。" : "当前账号没有权限访问该产品。";

  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      requestId,
      success: false,
      error: {
        code,
        message,
        requestId
      }
    },
    {
      status
    }
  );
}

async function applyAdminIngestGate(request: NextRequest, requestHeaders: Headers, requestId: string) {
  const pathname = request.nextUrl.pathname;

  if (pathname !== "/admin-ingest" && !pathname.startsWith("/admin-ingest/")) {
    return null;
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSession) {
    const redirectResponse = redirectToIngestLogin(request);

    logger.warn("auth.admin_ingest_gate", {
      requestId,
      pathname,
      hasSessionCookie: false,
      licenseGateValid: false,
      redirectTarget: redirectResponse.headers.get("location"),
      reason: "unauthenticated"
    });

    return redirectResponse;
  }

  const gate = await verifyIngestPortalCookieValue(request.cookies.get(INGEST_PORTAL_COOKIE_NAME)?.value);

  if (!gate.valid || !gate.licenseActivated) {
    const redirectResponse = redirectToIngestActivate(request);

    logger.warn("auth.admin_ingest_gate", {
      requestId,
      pathname,
      hasSessionCookie: true,
      licenseGateValid: gate.valid,
      licenseActivated: gate.licenseActivated,
      redirectTarget: redirectResponse.headers.get("location"),
      reason: gate.valid ? "license_not_activated" : "license_gate_missing_or_invalid"
    });

    return redirectResponse;
  }

  logger.info("auth.admin_ingest_gate", {
    requestId,
    pathname,
    hasSessionCookie: true,
    licenseGateValid: true,
    licenseActivated: true,
    redirectTarget: null,
    reason: "allowed"
  });

  return nextWithRequestHeaders(requestHeaders);
}

async function applyPageAuth(request: NextRequest, requestHeaders: Headers, requestId: string) {
  const pathname = request.nextUrl.pathname;
  const product = getProductFromPath(pathname);

  requestHeaders.set(PRODUCT_ACCESS_HEADER, product);

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

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname.startsWith("/api/")) {
    if (product !== "public" && !hasSession) {
      const response = apiAuthError("UNAUTHORIZED", 401, requestId);

      logger.warn("product.api_blocked", {
        requestId,
        pathname,
        product,
        reason: "unauthenticated"
      });

      return response;
    }

    return nextWithRequestHeaders(requestHeaders);
  }

  const adminIngestGateResponse = await applyAdminIngestGate(request, requestHeaders, requestId);

  if (adminIngestGateResponse) {
    return adminIngestGateResponse;
  }

  const needsSession =
    product !== "public" ||
    isPathUnder(pathname, protectedPagePrefixes) ||
    isPathUnder(pathname, sessionOnlyPagePrefixes);

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

  if (pathname === "/no-access" && product !== "public") {
    return redirectToNoAccess(request);
  }

  logger.info("auth.redirect_check", {
    requestId,
    pathname,
    hasSessionCookie: hasSession,
    sessionValid: hasSession ? null : false,
    redirectTarget: null,
    product,
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

  const response = withSecurityHeaders(await applyPageAuth(request, requestHeaders, requestId), request.nextUrl.pathname);

  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
