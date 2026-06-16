import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  AddKnowledgeInput,
  KnowledgeRecord,
  PaginationParams,
  PrismaEntityMapping,
  RepositoryResult,
  SearchKnowledgeInput
} from "@/types/saas-core";

export const knowledgePrismaMapping: PrismaEntityMapping<"Knowledge"> = {
  entity: "Knowledge",
  prismaModel: "Prisma.Knowledge",
  fields: {
    id: "id",
    tenantId: "tenantId",
    title: "title",
    category: "category",
    summary: "summary",
    status: "status",
    updatedAt: "updatedAt"
  }
};

function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data, source: getDataSource().type };
}

function failure<T>(error: unknown): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Knowledge repository failed.",
    source: getDataSource().type
  };
}

export async function searchKnowledge(input: SearchKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord[]>> {
  try {
    return success(await getDataSource().knowledge.searchKnowledge(input));
  } catch (error) {
    return failure(error);
  }
}

export async function addKnowledge(input: AddKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord>> {
  try {
    return success(await getDataSource().knowledge.addKnowledge(input));
  } catch (error) {
    return failure(error);
  }
}

export async function listKnowledgeByTenant(
  tenantId: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  try {
    return success(await getDataSource().knowledge.listKnowledgeByTenant(tenantId, pagination));
  } catch (error) {
    return failure(error);
  }
}
