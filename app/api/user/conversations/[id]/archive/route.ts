import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser, readOptionalJsonBody } from "@/lib/conversation-control/api";
import { archiveConversation } from "@/lib/conversation-control/operations";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireConversationUser(request, "conversation", params.id);

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("归档会话"));
    }

    const body = await readOptionalJsonBody(request);
    const result = await archiveConversation(actor, params.id, body, request);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
