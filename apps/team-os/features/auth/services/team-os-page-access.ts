import "server-only";

import { redirect } from "next/navigation";
import { TEAM_OS_LOGIN_PATH } from "@/apps/team-os/features/auth/constants";
import { requireUserAppAccess } from "@/lib/auth/guards";
import {
  ForbiddenError,
  LicenseAppTypeMismatchError,
  LicenseRequiredError,
  UnauthorizedError
} from "@/lib/errors";

export async function enforceTeamOsPageAccess(nextPath: string) {
  try {
    return await requireUserAppAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`${TEAM_OS_LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`);
    }

    if (error instanceof LicenseRequiredError) {
      redirect("/unlock");
    }

    if (error instanceof ForbiddenError || error instanceof LicenseAppTypeMismatchError) {
      redirect("/no-access");
    }

    throw error;
  }
}
