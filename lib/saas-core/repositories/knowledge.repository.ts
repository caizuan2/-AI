import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  AddKnowledgeInput,
  DataSourceType,
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

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Knowledge repository failed.",
    source
  };
}

async function searchKnowledgeWithSource(
  source: DataSourceType,
  input: SearchKnowledgeInput
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  try {
    return success(await getDataSource(source).knowledge.searchKnowledge(input), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function addKnowledgeWithSource(source: DataSourceType, input: AddKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord>> {
  try {
    return success(await getDataSource(source).knowledge.addKnowledge(input), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function listKnowledgeByTenantWithSource(
  source: DataSourceType,
  tenantId: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  try {
    return success(await getDataSource(source).knowledge.listKnowledgeByTenant(tenantId, pagination), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function searchKnowledge(input: SearchKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return searchKnowledgeWithSource(getDataSource().type, input);
}

export function searchKnowledgeMock(input: SearchKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return searchKnowledgeWithSource("mock", input);
}

export function searchKnowledgePrisma(input: SearchKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return searchKnowledgeWithSource("prisma", input);
}

export function addKnowledge(input: AddKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord>> {
  return addKnowledgeWithSource(getDataSource().type, input);
}

export function addKnowledgeMock(input: AddKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord>> {
  return addKnowledgeWithSource("mock", input);
}

export function addKnowledgePrisma(input: AddKnowledgeInput): Promise<RepositoryResult<KnowledgeRecord>> {
  return addKnowledgeWithSource("prisma", input);
}

export function listKnowledgeByTenant(
  tenantId: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return listKnowledgeByTenantWithSource(getDataSource().type, tenantId, pagination);
}

export function listKnowledgeByTenantMock(
  tenantId: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return listKnowledgeByTenantWithSource("mock", tenantId, pagination);
}

export function listKnowledgeByTenantPrisma(
  tenantId: string,
  pagination?: PaginationParams
): Promise<RepositoryResult<KnowledgeRecord[]>> {
  return listKnowledgeByTenantWithSource("prisma", tenantId, pagination);
}
