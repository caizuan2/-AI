import { apiError, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser } from "@/lib/conversation-control/api";
import { shareConversation } from "@/lib/conversation-control/operations";
import { conversationActionSuccess } from "@/lib/conversation-control/response";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function readConversationId(context: RouteContext) {
  const params = await context.params;

  return typeof params?.id === "string" ? params.id : "";
}

export async function POST(request: Request, context: RouteContext) {
  const conversationId = await readConversationId(context);

  logger.info("[conversation-share] request start", {
    conversationId
  });

  try {
    const actor = await requireConversationUser(request, "conversation", conversationId);
    logger.info("[conversation-share] auth ok", {
      userId: actor.id,
      conversationId
    });

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("分享会话"));
    }

    const result = await shareConversation(actor, conversationId, request);
    logger.info("[conversation-share] created share link", {
      userId: actor.id,
      conversationId,
      hasUrl: Boolean(result.shareUrl)
    });

    return conversationActionSuccess(result);
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "FEATURE_DISABLED") {
      logger.warn("[conversation-share] denied", {
        conversationId,
        reason: "FEATURE_DISABLED"
      });
    }

    return apiError(appError);
  }
}
