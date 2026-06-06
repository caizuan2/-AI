import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { getAiChatHistory } from "@/lib/ai-chat/ask";
import { requireRole } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireRole>>;

  try {
    actor = await requireRole("user", {
      request,
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ai_chat_history"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取用户会话历史"));
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversation_id")?.trim();

  if (!conversationId) {
    return apiError(new ValidationError("conversation_id 不能为空。"));
  }

  try {
    const result = await getAiChatHistory({
      id: actor.id,
      role: actor.role
    }, conversationId);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
