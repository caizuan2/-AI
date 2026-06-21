import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { getConversationShareByToken } from "@/lib/conversation-control/public-access";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取分享会话"));
    }

    const result = await getConversationShareByToken(params.token);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
