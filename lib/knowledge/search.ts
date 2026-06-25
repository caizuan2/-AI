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
  userId: string
): Promise<KnowledgeSearchResponse> {
  return retrieveKnowledge({
    query,
    topK,
    userId,
    appType: "user_app",
    includeShared: true,
    includePublished: true
  });
}
