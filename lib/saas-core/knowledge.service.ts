import {
  addKnowledge,
  listKnowledgeByTenant,
  searchKnowledge
} from "@/lib/saas-core/repositories/knowledge.repository";
import type {
  AddKnowledgeInput,
  KnowledgeRecord,
  PaginationParams,
  RepositoryResult,
  SearchKnowledgeInput
} from "@/types/saas-core";

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function searchTenantKnowledge(input: SearchKnowledgeInput): Promise<KnowledgeRecord[]> {
  return unwrap(await searchKnowledge(input));
}

export async function createKnowledge(input: AddKnowledgeInput): Promise<KnowledgeRecord> {
  return unwrap(await addKnowledge(input));
}

export async function getTenantKnowledge(tenantId: string, pagination?: PaginationParams): Promise<KnowledgeRecord[]> {
  return unwrap(await listKnowledgeByTenant(tenantId, pagination));
}
