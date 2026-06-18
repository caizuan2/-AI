import { NextResponse } from "next/server";
import { superAdminError } from "@/app/api/super-admin/_shared";
import { UserAdminOperationError } from "@/lib/super-admin/services/user-admin.service";

export function superAdminUserError(error: unknown) {
  if (error instanceof UserAdminOperationError) {
    return NextResponse.json(
      {
        success: false,
        error: error.code,
        message: error.message,
        timestamp: Date.now()
      },
      {
        status: error.statusCode
      }
    );
  }

  return superAdminError(error);
}
