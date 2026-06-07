import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireLicensedUser } from "@/lib/auth/guards";
import { listPublicKnowledgeCategories, type PublicKnowledgeCategoriesResponse } from "@/lib/knowledge/categories";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireLicensedUser();

    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取用户端分类"));
    }

    return apiSuccess<PublicKnowledgeCategoriesResponse>(await listPublicKnowledgeCategories());
  } catch (error) {
    return apiError(error);
  }
}
