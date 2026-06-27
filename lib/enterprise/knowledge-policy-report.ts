import "server-only";

import type {
  KnowledgePolicyDecision,
  KnowledgePolicyRiskLevel,
  KnowledgePolicySignal
} from "@/lib/enterprise/knowledge-policy-types";

export type KnowledgePolicyReportItem = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  policy: KnowledgePolicySignal;
};

export type KnowledgePolicyRecommendation = {
  type:
    | "policy_review_required"
    | "policy_merge_candidate"
    | "policy_archive_candidate"
    | "policy_blocked_auto_action"
    | "policy_decay"
    | "policy_boost";
  riskLevel: KnowledgePolicyRiskLevel;
  chunkId: string;
  knowledgeItemId: string;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  title: string;
  message: string;
};

function count(items: KnowledgePolicyReportItem[], decision: KnowledgePolicyDecision) {
  return items.filter((item) => item.policy.decision === decision).length;
}

export function summarizeKnowledgePolicy(items: KnowledgePolicyReportItem[]) {
  const total = items.length;
  const avgPolicyScore = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.policy.policyScore, 0) / total) * 10000) / 10000
    : 0;
  const avgPolicyConfidence = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.policy.confidence, 0) / total) * 10000) / 10000
    : 0;

  return {
    analyzedChunkCount: total,
    boostCount: count(items, "boost"),
    keepCount: count(items, "keep"),
    monitorCount: count(items, "monitor"),
    decayCount: count(items, "decay"),
    reviewRequiredCount: count(items, "review_required"),
    mergeCandidateCount: count(items, "merge_candidate"),
    archiveCandidateCount: count(items, "archive_candidate"),
    blockedAutoActionCount: count(items, "blocked_auto_action"),
    unknownCount: count(items, "unknown"),
    highRiskCount: items.filter((item) => item.policy.riskLevel === "high").length,
    criticalRiskCount: items.filter((item) => item.policy.riskLevel === "critical").length,
    humanReviewCount: items.filter((item) => item.policy.requiresHumanReview).length,
    avgPolicyScore,
    avgPolicyConfidence,
    shadowMode: true
  };
}

export function buildPolicyRecommendations(items: KnowledgePolicyReportItem[]) {
  return items
    .flatMap((item): KnowledgePolicyRecommendation[] => {
      if (item.policy.decision === "boost") {
        return [{
          type: "policy_boost",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识表现稳定且持续上升，可提高检索优先级"
        }];
      }

      if (item.policy.decision === "decay") {
        return [{
          type: "policy_decay",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识表现下降，建议轻微降低检索权重"
        }];
      }

      if (item.policy.decision === "review_required") {
        return [{
          type: "policy_review_required",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识存在冲突或过期风险，建议人工复核"
        }];
      }

      if (item.policy.decision === "merge_candidate") {
        return [{
          type: "policy_merge_candidate",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识疑似重复，建议人工合并"
        }];
      }

      if (item.policy.decision === "archive_candidate") {
        return [{
          type: "policy_archive_candidate",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "该知识为归档候选，仅建议人工复核，不自动归档"
        }];
      }

      if (item.policy.decision === "blocked_auto_action") {
        return [{
          type: "policy_blocked_auto_action",
          riskLevel: item.policy.riskLevel,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "策略风险过高，已阻断自动处理，仅允许人工复核"
        }];
      }

      return [];
    })
    .slice(0, 100);
}
