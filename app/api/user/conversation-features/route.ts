import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser } from "@/lib/conversation-control/api";
import {
  buildConversationFeatureFlagResponse,
  getConversationFeatureFlags
} from "@/lib/conversation-control/feature-flags";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireConversationUser(request, "conversation_features");

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取会话功能开关"));
    }

    const flags = await getConversationFeatureFlags();

    return apiSuccess(buildConversationFeatureFlagResponse(flags));
  } catch (error) {
    return apiError(error);
  }
}
