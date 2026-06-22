import { apiError, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser } from "@/lib/conversation-control/api";
import { deleteGroupChatInviteLink } from "@/lib/conversation-control/operations";
import { conversationActionSuccess } from "@/lib/conversation-control/response";
import { AppError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireConversationUser(request, "conversation", params.id);

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("删除群聊链接"));
    }

    const result = await deleteGroupChatInviteLink(actor, params.id, request);

    return conversationActionSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export function GET() {
  return apiError(new AppError("NOT_IMPLEMENTED", "获取群聊链接接口暂未接入。", 405));
}

export function POST() {
  return apiError(new AppError("NOT_IMPLEMENTED", "删除群聊链接接口请使用 DELETE。", 405));
}
