import { NextResponse } from "next/server";
import { apiError, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import {
  buildConversationFeatureFlagResponse,
  getConversationFeatureFlags
} from "@/lib/conversation-control/feature-flags";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUserAppAccess();

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取会话功能开关"));
    }

    const flags = await getConversationFeatureFlags();
    const data = buildConversationFeatureFlagResponse(flags);

    return NextResponse.json({
      ok: true,
      success: true,
      ...data,
      data
    });
  } catch (error) {
    return apiError(error);
  }
}
