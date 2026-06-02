import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireLicensedUser } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  refreshCompletionSuggestionsForItem,
  type CompletionSuggestionMode
} from "@/lib/knowledge/completion-suggestions";
import type { KnowledgeCompletionSuggestion } from "@/lib/ai/knowledge-completion";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

interface CompletionSuggestionsResponse {
  suggestions: KnowledgeCompletionSuggestion[];
  mode: CompletionSuggestionMode;
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let currentUser: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    currentUser = await requireLicensedUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("生成补全建议"));
  }

  try {
    const item = await prisma.knowledgeItem.findFirst({
      where: {
        id: context.params.id,
        userId: currentUser.id
      },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        tags: true,
        category: true,
        importance: true,
        clarityScore: true,
        completenessScore: true,
        usefulnessScore: true,
        confidenceScore: true
      }
    });

    if (!item) {
      return apiError(new NotFoundError("知识不存在。"));
    }

    const result = await refreshCompletionSuggestionsForItem(item, {
      requestId,
      userId: currentUser.id
    });

    return apiSuccess<CompletionSuggestionsResponse>({
      suggestions: result.suggestions,
      mode: result.mode
    });
  } catch (error) {
    return apiError(error);
  }
}
