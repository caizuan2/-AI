import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickPrimaryRole(roles: string[] = []) {
  if (roles.includes("super_admin")) {
    return "super_admin";
  }

  if (roles.includes("kb_admin")) {
    return "kb_admin";
  }

  if (roles.includes("user")) {
    return "user";
  }

  return roles[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const authUser = await toIngestAuthUser(user);

    await setIngestPortalCookie(user, request);

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: authUser,
      licenseActivated: authUser.licenseActivated,
      role: pickPrimaryRole(authUser.roles)
    });
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "UNAUTHORIZED") {
      return NextResponse.json({
        success: true,
        authenticated: false,
        licenseActivated: false,
        role: null
      });
    }

    console.error("[ingest:auth:me]", {
      errorCode: appError.code,
      message: appError.message
    });

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        licenseActivated: false,
        role: null,
        errorCode: "AUTH_ME_FAILED",
        message: "登录状态检查失败"
      },
      { status: 500 }
    );
  }
}
