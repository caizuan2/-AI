import "server-only";

import { redirect } from "next/navigation";
import { requireIngestAdminAccess, requireUserAppAccess } from "@/lib/auth/guards";
import {
  ForbiddenError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseRequiredError,
  UnauthorizedError
} from "@/lib/errors";

function handlePageAccessError(error: unknown, nextPath: string): never {
  if (error instanceof UnauthorizedError) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (error instanceof LicenseRequiredError) {
    redirect("/unlock");
  }

  if (error instanceof ForbiddenError || error instanceof LicenseAppTypeMismatchError) {
    redirect("/no-access");
  }

  throw error;
}

export async function enforceUserAppPageAccess(nextPath: string) {
  try {
    return await requireUserAppAccess();
  } catch (error) {
    if (error instanceof LicenseDisabledError) {
      redirect("/unlock?reactivate=1&reason=disabled");
    }

    if (error instanceof LicenseExpiredError) {
      redirect("/unlock?reactivate=1&reason=expired");
    }

    handlePageAccessError(error, nextPath);
  }
}

export async function enforceIngestAdminPageAccess(nextPath: string) {
  try {
    return await requireIngestAdminAccess();
  } catch (error) {
    handlePageAccessError(error, nextPath);
  }
}
