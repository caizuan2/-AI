import "server-only";

import type { KnowledgeTrendDiagnostics } from "@/lib/enterprise/knowledge-trend-types";

export type KnowledgeTrendReportItem = {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  sourceTitle: string | null;
  agentId: string;
  knowledgeBaseId: string;
  namespace: string;
  trend: KnowledgeTrendDiagnostics;
};

export function summarizeKnowledgeTrends(items: KnowledgeTrendReportItem[]) {
  const total = items.length;
  const avgTrendScore = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.trend.trendScore, 0) / total) * 10000) / 10000
    : 0;
  const avgTrendConfidence = total > 0
    ? Math.round((items.reduce((sum, item) => sum + item.trend.confidence, 0) / total) * 10000) / 10000
    : 0;

  return {
    analyzedChunkCount: total,
    avgTrendScore,
    avgTrendConfidence,
    fastRisingCount: items.filter((item) => item.trend.fastRising).length,
    staleHighScoreCount: items.filter((item) => item.trend.staleHighScore).length,
    decliningTrendCount: items.filter((item) => item.trend.decliningTrend).length,
    evergreenCount: items.filter((item) => item.trend.evergreen).length,
    shadowModeCount: items.filter((item) => item.trend.shadowMode).length,
    avgStaleRisk: total > 0
      ? Math.round((items.reduce((sum, item) => sum + item.trend.staleRisk, 0) / total) * 10000) / 10000
      : 0
  };
}

export function buildTrendRecommendations(items: KnowledgeTrendReportItem[]) {
  return items
    .flatMap((item) => {
      const recommendations = [];

      if (item.trend.fastRising) {
        recommendations.push({
          type: "fast_rising_boost" as const,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "新知识近期上升明显，可提高优先级并继续观察"
        });
      }

      if (item.trend.staleHighScore) {
        recommendations.push({
          type: "stale_high_score_review" as const,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "历史高分知识近期走弱，建议人工复核是否需要更新"
        });
      }

      if (item.trend.decliningTrend) {
        recommendations.push({
          type: "declining_trend_review" as const,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "知识近期命中或反馈趋势下降，建议复查内容适用性"
        });
      }

      if (item.trend.evergreen) {
        recommendations.push({
          type: "evergreen_keep" as const,
          chunkId: item.chunkId,
          knowledgeItemId: item.knowledgeItemId,
          agentId: item.agentId,
          knowledgeBaseId: item.knowledgeBaseId,
          namespace: item.namespace,
          title: item.title,
          message: "长期稳定高价值知识，建议作为常青知识保留"
        });
      }

      return recommendations;
    })
    .slice(0, 80);
}
