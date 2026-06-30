import type {
  IngestMemoryItem,
  IngestMemoryRecallCandidate
} from "@/lib/enterprise/ingest-memory-types";
import {
  findMatchedMemoryFields,
  scoreTextSimilarity
} from "@/lib/enterprise/ingest-memory-vectorizer";

export type MemoryRankCandidate = {
  memory: IngestMemoryItem;
  similarityScore: number;
  matchedFields?: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeContentKey(memory: IngestMemoryItem) {
  return `${memory.type}:${memory.title}:${memory.content}`
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function recencyScore(memory: IngestMemoryItem) {
  const updatedAt = memory.updatedAt ?? memory.createdAt;
  const ageDays = Math.max(0, (Date.now() - updatedAt) / 86400000);

  return clampScore(1 - ageDays / 60);
}

export function rankMemoryCandidates(input: {
  query: string;
  candidates: MemoryRankCandidate[];
  agentId?: string;
  knowledgeBaseId?: string;
  preferredType?: IngestMemoryItem["type"];
  limit?: number;
  minScore?: number;
}): IngestMemoryRecallCandidate[] {
  const deduped = new Map<string, MemoryRankCandidate>();

  for (const candidate of input.candidates) {
    const key = normalizeContentKey(candidate.memory);
    const existing = deduped.get(key);

    if (!existing || existing.similarityScore < candidate.similarityScore) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values())
    .map((candidate) => {
      const memory = candidate.memory;
      const similarityScore = candidate.similarityScore || scoreTextSimilarity(input.query, memory);
      const sameAgent = input.agentId && memory.agentId === input.agentId ? 1 : 0;
      const sameKnowledgeBase = input.knowledgeBaseId && memory.knowledgeBaseId === input.knowledgeBaseId ? 1 : 0;
      const sameType = input.preferredType && memory.type === input.preferredType ? 1 : 0;
      const confidence = memory.confidence ?? 0.5;
      const recent = recencyScore(memory);
      const score = clampScore(
        similarityScore * 0.45
        + sameAgent * 0.2
        + sameKnowledgeBase * 0.15
        + sameType * 0.08
        + confidence * 0.07
        + recent * 0.05
      );
      const matchedFields = candidate.matchedFields?.length
        ? candidate.matchedFields
        : findMatchedMemoryFields(input.query, memory);
      const reasonParts = [
        similarityScore > 0.25 ? "语义相似" : "",
        sameAgent ? "同 Agent" : "",
        sameKnowledgeBase ? "同知识库" : "",
        sameType ? "同类型" : "",
        confidence >= 0.72 ? "高置信" : "",
        recent > 0.8 ? "近期训练" : ""
      ].filter(Boolean);

      return {
        memory,
        score,
        reason: reasonParts.join(" / ") || "规则召回",
        matchedFields
      };
    })
    .filter((item) => item.score >= (input.minScore ?? 0.25))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? 5);
}
