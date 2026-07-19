import "server-only";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  requireTeamOsAccess,
  TeamOsAccessError,
  toTeamOsAccessDecision,
  toTeamOsDeniedDecision
} from "@/apps/team-os/features/auth/services/team-os-access";

export async function handleTeamOsAccessGet(request: Request) {
  try {
    return apiSuccess(toTeamOsAccessDecision(await requireTeamOsAccess(request)));
  } catch (error) {
    if (error instanceof TeamOsAccessError) {
      return apiSuccess(toTeamOsDeniedDecision(error));
    }

    return apiError(error);
  }
}
