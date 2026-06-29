import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { listAiChatConversations } from "@/lib/ai-chat/ask";
import { requireAiChatAccess } from "@/lib/auth/guards";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireAiChatAccess>>;

  try {
    actor = await requireAiChatAccess(request, "ai_chat_conversations");
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取用户会话列表"));
  }

  try {
    const result = await listAiChatConversations({
      id: actor.id,
      role: actor.role
    });

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
