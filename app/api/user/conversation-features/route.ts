import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  buildConversationFeatureFlagResponse,
  defaultConversationFeatureFlags,
  getConversationFeatureFlags
} from "@/lib/conversation-control/feature-flags";
import { hasDatabaseUrl } from "@/lib/server-config";
import type { ConversationFeatureFlags } from "@/types/conversation-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取会话功能开关"));
    }

    if (!user.licenseActivated) {
      const reasons = Object.keys(defaultConversationFeatureFlags).reduce<
        Partial<Record<keyof ConversationFeatureFlags, string>>
      >((result, key) => {
        result[key as keyof ConversationFeatureFlags] = "LICENSE_REQUIRED";

        return result;
      }, {});

      return apiSuccess(buildConversationFeatureFlagResponse(defaultConversationFeatureFlags, reasons));
    }

    const flags = await getConversationFeatureFlags();

    return apiSuccess(buildConversationFeatureFlagResponse(flags));
  } catch (error) {
    return apiError(error);
  }
}
