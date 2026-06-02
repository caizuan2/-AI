import "server-only";

import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const defaultKnowledgeCategory = "未分类";

export interface KnowledgeCategorySummary {
  name: string;
  count: number;
}

export interface KnowledgeCategoriesResponse {
  categories: KnowledgeCategorySummary[];
  totalCategories: number;
  totalItems: number;
}

export function normalizeCategoryName(value: unknown, fieldName = "分类") {
  const category = typeof value === "string" ? value.trim() : "";

  if (!category) {
    throw new ValidationError(`${fieldName}不能为空。`);
  }

  if (category.length > 40) {
    throw new ValidationError(`${fieldName}不能超过 40 个字符。`);
  }

  return category;
}

export async function listKnowledgeCategories(userId: string): Promise<KnowledgeCategoriesResponse> {
  const grouped = await prisma.knowledgeItem.groupBy({
    by: ["category"],
    where: { userId },
    _count: {
      _all: true
    },
    orderBy: {
      _count: {
        category: "desc"
      }
    }
  });
  const categories = grouped
    .map((item) => ({
      name: item.category,
      count: item._count._all
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));

  return {
    categories,
    totalCategories: categories.length,
    totalItems: categories.reduce((total, category) => total + category.count, 0)
  };
}

export async function getExistingCategoryNames(userId: string) {
  const response = await listKnowledgeCategories(userId);

  return response.categories.map((category) => category.name);
}
