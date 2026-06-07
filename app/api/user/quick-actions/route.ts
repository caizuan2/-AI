import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireLicensedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import {
  serializePublicQuickAction,
  type QuickActionCategoryRecord,
  type QuickActionCategoryView
} from "@/lib/quick-actions";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface UserQuickActionsResponse {
  quickActions: QuickActionCategoryView[];
}

export async function GET() {
  try {
    await requireLicensedUser();

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取快捷分类"));
    }

    const quickActions = await prisma.$queryRaw<QuickActionCategoryRecord[]>`
      SELECT id, name, description, icon, type, action, prompt, enabled, "sortOrder", "createdAt", "updatedAt"
      FROM "quick_action_categories"
      WHERE enabled = true
      ORDER BY "sortOrder" ASC, "createdAt" ASC
    `;

    return apiSuccess<UserQuickActionsResponse>({
      quickActions: quickActions.map(serializePublicQuickAction)
    });
  } catch (error) {
    return apiError(error);
  }
}
