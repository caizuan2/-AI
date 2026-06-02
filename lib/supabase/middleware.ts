import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalAuthAllowedHost, LOCAL_AUTH_COOKIE_NAME, readLocalAuthCookie } from "@/lib/auth/local";
import { getSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config";

const protectedPagePrefixes = [
  "/ingest",
  "/upload",
  "/knowledge",
  "/review",
  "/tags",
  "/categories",
  "/chat",
  "/settings",
  "/waitlist",
  "/feedback",
  "/admin"
];
const authPagePrefixes = ["/login", "/register"];

function isPathUnder(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  const loginUrl = request.nextUrl.clone();

  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirectTo", `${url.pathname}${url.search}`);

  return NextResponse.redirect(loginUrl);
}

function nextWithRequestHeaders(request: NextRequest, requestHeaders?: Headers) {
  if (requestHeaders) {
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  return NextResponse.next({ request });
}

export async function updateSupabaseSession(request: NextRequest, requestHeaders?: Headers) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = isPathUnder(pathname, protectedPagePrefixes);
  const isAuthPage = isPathUnder(pathname, authPagePrefixes);

  if (!hasSupabaseConfig()) {
    const localUser = isLocalAuthAllowedHost(request.nextUrl.hostname)
      ? readLocalAuthCookie(request.cookies.get(LOCAL_AUTH_COOKIE_NAME)?.value)
      : null;

    if (isProtectedPage && !localUser) {
      return redirectToLogin(request);
    }

    if (isAuthPage && localUser) {
      const url = request.nextUrl.clone();

      url.pathname = "/knowledge";
      url.search = "";

      return NextResponse.redirect(url);
    }

    return nextWithRequestHeaders(request, requestHeaders);
  }

  let response = nextWithRequestHeaders(request, requestHeaders);
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = nextWithRequestHeaders(request, requestHeaders);

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser().catch(() => ({
    data: { user: null }
  }));

  if (isProtectedPage && !user) {
    return redirectToLogin(request);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();

    url.pathname = "/knowledge";
    url.search = "";

    return NextResponse.redirect(url);
  }

  return response;
}
