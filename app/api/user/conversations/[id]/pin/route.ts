import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireConversationUser, readOptionalJsonBody } from "@/lib/conversation-control/api";
import { setConversationPin } from "@/lib/conversation-control/operations";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const conversationId = typeof params?.id === "string" ? params.id : "";
    const actor = await requireConversationUser(request, "conversation", conversationId);

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("置顶会话"));
    }

    const body = await readOptionalJsonBody(request);
    const result = await setConversationPin(actor, conversationId, body, request);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
