import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { readOptionalJsonBody } from "@/lib/conversation-control/api";
import {
  buildConversationFeatureFlagResponse,
  getConversationFeatureFlags,
  updateConversationFeatureFlags
} from "@/lib/conversation-control/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    const flags = await getConversationFeatureFlags();

    return superAdminSuccess(buildConversationFeatureFlagResponse(flags));
  } catch (error) {
    return superAdminError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await enforceSuperAdminApiAccess(request);
    const body = await readOptionalJsonBody(request);
    const flags = await updateConversationFeatureFlags(actor, body, request);

    return superAdminSuccess(buildConversationFeatureFlagResponse(flags));
  } catch (error) {
    return superAdminError(error);
  }
}
