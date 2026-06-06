import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { defaultKnowledgeCategory, listKnowledgeCategories, normalizeCategoryName } from "@/lib/knowledge/categories";
import type { KnowledgeCategoriesResponse } from "@/lib/knowledge/categories";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface CategoryMutationResponse extends KnowledgeCategoriesResponse {
  updatedItems: number;
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("请求体必须是合法 JSON。");
  }
}

async function getCurrentUserOrThrow() {
  return requireKbAdmin(undefined, {
    targetType: "knowledge_category"
  });
}

async function getCategoriesResponse(userId: string) {
  return listKnowledgeCategories(userId);
}

export async function GET() {
  let currentUser: Awaited<ReturnType<typeof getCurrentUserOrThrow>>;

  try {
    currentUser = await getCurrentUserOrThrow();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载分类"));
  }

  try {
    return apiSuccess<KnowledgeCategoriesResponse>(await getCategoriesResponse(currentUser.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  let currentUser: Awaited<ReturnType<typeof getCurrentUserOrThrow>>;

  try {
    currentUser = await getCurrentUserOrThrow();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("重命名分类"));
  }

  try {
    const body = await parseJsonBody(request);

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    const from = normalizeCategoryName(body.from, "原分类");
    const to = normalizeCategoryName(body.to, "新分类");

    if (from === to) {
      throw new ValidationError("新分类不能和原分类相同。");
    }

    const result = await prisma.knowledgeItem.updateMany({
      where: {
        userId: currentUser.id,
        category: from,
        deletedAt: null
      },
      data: {
        category: to
      }
    });
    const categoriesResponse = await getCategoriesResponse(currentUser.id);

    return apiSuccess<CategoryMutationResponse>({
      ...categoriesResponse,
      updatedItems: result.count
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  let currentUser: Awaited<ReturnType<typeof getCurrentUserOrThrow>>;

  try {
    currentUser = await getCurrentUserOrThrow();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("删除分类"));
  }

  try {
    const { searchParams } = new URL(request.url);
    let category = searchParams.get("category")?.trim() ?? "";

    if (!category) {
      const body = await parseJsonBody(request);

      if (!isPlainObject(body)) {
        throw new ValidationError("请求体必须是 JSON 对象。");
      }

      category = normalizeCategoryName(body.category);
    }

    if (category === defaultKnowledgeCategory) {
      throw new ValidationError(`默认分类「${defaultKnowledgeCategory}」不能删除。`);
    }

    const result = await prisma.knowledgeItem.updateMany({
      where: {
        userId: currentUser.id,
        category,
        deletedAt: null
      },
      data: {
        category: defaultKnowledgeCategory
      }
    });
    const categoriesResponse = await getCategoriesResponse(currentUser.id);

    return apiSuccess<CategoryMutationResponse>({
      ...categoriesResponse,
      updatedItems: result.count
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let currentUser: Awaited<ReturnType<typeof getCurrentUserOrThrow>>;

  try {
    currentUser = await getCurrentUserOrThrow();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("合并分类"));
  }

  try {
    const body = await parseJsonBody(request);

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    const rawSourceCategories = Array.isArray(body.sourceCategories) ? body.sourceCategories : [body.from];
    const sourceCategories = Array.from(new Set(rawSourceCategories.map((category) => normalizeCategoryName(category, "待合并分类"))));
    const targetCategory = normalizeCategoryName(body.targetCategory ?? body.to, "目标分类");

    if (sourceCategories.length === 0) {
      throw new ValidationError("请选择要合并的分类。");
    }

    if (sourceCategories.includes(targetCategory)) {
      throw new ValidationError("目标分类不能同时作为待合并分类。");
    }

    const result = await prisma.knowledgeItem.updateMany({
      where: {
        userId: currentUser.id,
        category: {
          in: sourceCategories
        },
        deletedAt: null
      },
      data: {
        category: targetCategory
      }
    });
    const categoriesResponse = await getCategoriesResponse(currentUser.id);

    return apiSuccess<CategoryMutationResponse>({
      ...categoriesResponse,
      updatedItems: result.count
    });
  } catch (error) {
    return apiError(error);
  }
}
