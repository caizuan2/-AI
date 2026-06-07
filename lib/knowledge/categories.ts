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

export interface PublicKnowledgeCategorySummary {
  id: string;
  name: string;
  title: string;
  prompt: string;
  enabled: true;
  sortOrder: number;
}

export interface PublicKnowledgeCategoriesResponse {
  categories: PublicKnowledgeCategorySummary[];
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
    where: { userId, deletedAt: null },
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

export async function listPublicKnowledgeCategories(limit = 12): Promise<PublicKnowledgeCategoriesResponse> {
  const grouped = await prisma.knowledgeItem.groupBy({
    by: ["category"],
    where: {
      deletedAt: null,
      status: "active"
    },
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
    .filter((item) => item.name.trim().length > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, limit)
    .map((item, index) => ({
      id: `knowledge-category-${index}-${item.name}`,
      name: item.name,
      title: item.name,
      prompt: item.name,
      enabled: true as const,
      sortOrder: index
    }));

  return { categories };
}
