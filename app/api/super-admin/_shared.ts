import { NextResponse } from "next/server";
import { requireSuperAdminAccess } from "@/lib/auth/super-admin-check";
import { toAppError } from "@/lib/errors";
import type { SuperAdminApiResponse } from "@/types/super-admin";

export function superAdminSuccess<T>(data: T) {
  return NextResponse.json<SuperAdminApiResponse<T>>({
    success: true,
    data,
    timestamp: Date.now()
  });
}

export function superAdminError(error: unknown) {
  const appError = toAppError(error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: appError.code,
        message: appError.message
      },
      timestamp: Date.now()
    },
    {
      status: appError.statusCode
    }
  );
}

export async function enforceSuperAdminApiAccess(request: Request) {
  return requireSuperAdminAccess(request);
}
