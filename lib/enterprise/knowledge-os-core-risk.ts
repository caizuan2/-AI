import "server-only";

import type { KnowledgeOSRiskLevel } from "@/lib/enterprise/knowledge-os-core-types";

function clamp01(value: unknown, fallback = 0.25) {
  const numeric = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

export function classifyKnowledgeOSRisk(riskIndex: number): KnowledgeOSRiskLevel {
  if (!Number.isFinite(riskIndex)) return "unknown";
  if (riskIndex >= 0.7) return "critical";
  if (riskIndex >= 0.45) return "high";
  if (riskIndex >= 0.25) return "medium";

  return "low";
}

export function calculateKnowledgeOSRisk(input: {
  systemHealthScore?: number;
  highRiskRatio: number;
  criticalRiskRatio: number;
  lowQualityRatio: number;
  unknownMetadataRatio: number;
  reviewRatio: number;
}) {
  const systemHealthScore = clamp01(input.systemHealthScore, 0.5);
  const riskIndex = clamp01(
    ((1 - systemHealthScore) * 0.36)
    + (clamp01(input.highRiskRatio, 0) * 0.18)
    + (clamp01(input.criticalRiskRatio, 0) * 0.18)
    + (clamp01(input.lowQualityRatio, 0) * 0.1)
    + (clamp01(input.unknownMetadataRatio, 0) * 0.1)
    + (clamp01(input.reviewRatio, 0) * 0.08),
    0.25
  );

  return {
    riskIndex: Math.round(riskIndex * 10000) / 10000,
    riskLevel: classifyKnowledgeOSRisk(riskIndex)
  };
}
