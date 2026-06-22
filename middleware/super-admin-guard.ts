import { NextResponse, type NextRequest } from "next/server";

export const SUPER_ADMIN_LOGIN_PATH = "/login?next=/super-admin";

export function isSuperAdminPath(pathname: string) {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
}

export function redirectToSuperAdminLogin(request: NextRequest) {
  const url = request.nextUrl.clone();

  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.redirect(url);
}
