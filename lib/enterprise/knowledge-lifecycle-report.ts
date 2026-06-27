import "server-only";

import type { KnowledgeLifecycleSignal } from "@/lib/enterprise/knowledge-lifecycle-types";

export type KnowledgeLifecycleReportItem = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  lifecycle: KnowledgeLifecycleSignal;
};

export type KnowledgeLifecycleRecommendation = {
  type: "archive_candidate_review" | "lifecycle_review" | "growing_boost";
  chunkId: string;
  knowledgeItemId: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  title: string;
  message: string;
};

export function summarizeKnowledgeLifecycle(items: KnowledgeLifecycleReportItem[]) {
  const total = items.length;
  const count = (stage: KnowledgeLifecycleSignal["lifecycleStage"]) => items.filter((item) => item.lifecycle.lifecycleStage === stage).length;
  const avgLifecycleScore = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.lifecycle.lifecycleScore, 0) / total) * 10000) / 10000
    : 0;
  const avgLifecycleConfidence = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.lifecycle.lifecycleConfidence, 0) / total) * 10000) / 10000
    : 0;

  return {
    analyzedChunkCount: total,
    newCount: count("new"),
    growingCount: count("growing"),
    stableCount: count("stable"),
    decliningCount: count("declining"),
    archiveCandidateCount: count("archive_candidate"),
    unknownCount: count("unknown"),
    avgLifecycleScore,
    avgLifecycleConfidence,
    reviewCount: items.filter((item) => item.lifecycle.shouldReview).length,
    shadowMode: items.some((item) => item.lifecycle.lifecycleStage === "unknown" && item.lifecycle.lifecycleConfidence <= 0.25)
  };
}

export function buildLifecycleRecommendations(items: KnowledgeLifecycleReportItem[]) {
  return items
    .flatMap((item): KnowledgeLifecycleRecommendation[] => {
      const recommendations: KnowledgeLifecycleRecommendation[] = [];

      if (item.lifecycle.lifecycleStage === "archive_candidate") {
        return [{
          type: "archive_candidate_review",
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识长期低命中且趋势下降，建议人工复核是否归档"
        }];
      }

      if (item.lifecycle.lifecycleStage === "declining") {
        return [{
          type: "lifecycle_review",
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "部分知识进入衰退期，建议人工复核"
        }];
      }

      if (item.lifecycle.lifecycleStage === "growing") {
        return [{
          type: "growing_boost",
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识处于成长期，可适度提高检索优先级"
        }];
      }

      return recommendations;
    })
    .slice(0, 80);
}
