export interface RagDashboardRecord {
  query: string;
  hitCount: number;
  topK: number;
  contextChars: number;
  relevance_score: number;
  chunk_rank?: number;
  chunk_id?: string;
}

export interface ModelUsageRecord {
  model: string;
  actualModel: string;
  fallbackUsed: boolean;
  provider_status: string;
}

export interface FallbackRecord {
  provider_status: string;
  reason?: "rate_limit" | "timeout" | "invalid_key" | "provider_error" | "unknown";
  errorCode?: string;
}

export interface KnowledgeHealthRecord {
  query: string;
  missing_knowledge: boolean;
  relevance_score: number;
  repeated_count?: number;
  coverage_score?: number;
}

export interface AgentExecutionRecord {
  triggered: boolean;
  success: boolean;
  steps: string[];
  executor_status: string;
}

export interface DashboardSnapshotInput {
  rag: RagDashboardRecord[];
  model: ModelUsageRecord[];
  fallback: FallbackRecord[];
  knowledge: KnowledgeHealthRecord[];
  agent: AgentExecutionRecord[];
}

export interface DashboardOverview {
  system_health_score: number;
  stability_index: number;
  rag_score: number;
  model_efficiency: number;
  fallback_rate: number;
  knowledge_coverage: number;
  agent_activity: number;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ratioPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return clampPercent((part / total) * 100);
}
