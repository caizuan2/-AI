import { buildAgentDashboard } from "./agent_dashboard";
import { buildFallbackMonitor } from "./fallback_monitor";
import { buildKnowledgeHealthDashboard } from "./knowledge_health";
import { buildModelDashboard } from "./model_dashboard";
import { buildRagDashboard } from "./rag_dashboard";
import { clampPercent, type DashboardSnapshotInput } from "./dashboard_types";

export function buildDashboardCore(input: DashboardSnapshotInput) {
  const rag = buildRagDashboard(input.rag);
  const model = buildModelDashboard(input.model);
  const fallback = buildFallbackMonitor(input.fallback);
  const knowledge = buildKnowledgeHealthDashboard(input.knowledge);
  const agent = buildAgentDashboard(input.agent);
  const stabilityIndex = clampPercent((model.model_efficiency * 0.6) + ((100 - fallback.fallback_rate) * 0.4));
  const systemHealthScore = clampPercent(
    rag.rag_quality_score * 0.35 +
      model.model_efficiency * 0.2 +
      knowledge.coverage_score * 0.25 +
      stabilityIndex * 0.15 +
      agent.task_success_rate * 0.05,
  );

  return {
    system_health_score: systemHealthScore,
    rag_quality_score: rag.rag_quality_score,
    fallback_rate: fallback.fallback_rate,
    model_usage_stats: model.model_usage_stats,
    agent_execution_rate: agent.agent_execution_rate,
    knowledge_gap_count: knowledge.knowledge_gap_count,
    stability_index: stabilityIndex,
    panels: {
      rag,
      model,
      fallback,
      knowledge,
      agent,
    },
  };
}
