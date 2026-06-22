import { apiError, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser } from "@/lib/conversation-control/api";
import { createGroupChatFromConversation } from "@/lib/conversation-control/operations";
import { conversationActionSuccess } from "@/lib/conversation-control/response";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireConversationUser(request, "conversation", params.id);

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("创建群聊"));
    }

    const result = await createGroupChatFromConversation(actor, params.id, request);

    return conversationActionSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
