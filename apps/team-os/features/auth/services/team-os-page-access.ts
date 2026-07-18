import "server-only";

import { redirect } from "next/navigation";
import { TEAM_OS_LOGIN_PATH } from "@/apps/team-os/features/auth/constants";
import {
  requireTeamOsAccess,
  TeamOsAccessError
} from "@/apps/team-os/features/auth/services/team-os-access";
import { UnauthorizedError } from "@/lib/errors";

export async function enforceTeamOsPageAccess(nextPath: string) {
  try {
    return await requireTeamOsAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`${TEAM_OS_LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`);
    }

    if (error instanceof TeamOsAccessError) {
      redirect(error.destination);
    }

    throw error;
  }
}
