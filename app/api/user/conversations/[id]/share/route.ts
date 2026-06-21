import { apiError, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser } from "@/lib/conversation-control/api";
import { shareConversation } from "@/lib/conversation-control/operations";
import { conversationActionSuccess } from "@/lib/conversation-control/response";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  logger.info("[conversation-share] request start", {
    conversationId: params.id
  });

  try {
    const actor = await requireConversationUser(request, "conversation", params.id);
    logger.info("[conversation-share] auth ok", {
      userId: actor.id,
      conversationId: params.id
    });

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("分享会话"));
    }

    const result = await shareConversation(actor, params.id, request);
    logger.info("[conversation-share] created share link", {
      userId: actor.id,
      conversationId: params.id,
      hasUrl: Boolean(result.shareUrl)
    });

    return conversationActionSuccess(result);
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "FEATURE_DISABLED") {
      logger.warn("[conversation-share] denied", {
        conversationId: params.id,
        reason: "FEATURE_DISABLED"
      });
    }

    return apiError(appError);
  }
}
