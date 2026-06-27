import "server-only";

import {
  retrieveKnowledge,
  type RetrievedKnowledgeChunk,
  type RetrieveKnowledgeResponse
} from "@/lib/rag/retriever";

export type KnowledgeSearchResult = RetrievedKnowledgeChunk;
export type KnowledgeSearchResponse = RetrieveKnowledgeResponse;

export async function searchKnowledgeChunks(
  query: string,
  topK: number | undefined,
  userId: string,
  scope: {
    agentId?: string | null;
    knowledgeBaseId?: string | null;
    namespace?: string | null;
    tenantId?: string | null;
    knowledgeVersion?: string | number | null;
    minQualityScore?: number | null;
    includeLowQuality?: boolean;
  } = {}
): Promise<KnowledgeSearchResponse> {
  return retrieveKnowledge({
    query,
    topK,
    userId,
    tenantId: scope.tenantId,
    appType: "user_app",
    agentId: scope.agentId,
    knowledgeBaseId: scope.knowledgeBaseId,
    namespace: scope.namespace,
    knowledgeVersion: scope.knowledgeVersion,
    minQualityScore: scope.minQualityScore,
    includeLowQuality: scope.includeLowQuality,
    includeShared: true,
    includePublished: true
  });
}
