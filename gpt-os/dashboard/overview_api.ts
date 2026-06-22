import { buildDashboardCore } from "./dashboard_core";
import type { DashboardOverview, DashboardSnapshotInput } from "./dashboard_types";

export function buildOverviewApi(input: DashboardSnapshotInput): DashboardOverview {
  const dashboard = buildDashboardCore(input);

  return {
    system_health_score: dashboard.system_health_score,
    stability_index: dashboard.stability_index,
    rag_score: dashboard.rag_quality_score,
    model_efficiency: dashboard.panels.model.model_efficiency,
    fallback_rate: dashboard.fallback_rate,
    knowledge_coverage: dashboard.panels.knowledge.coverage_score,
    agent_activity: dashboard.agent_execution_rate,
  };
}
