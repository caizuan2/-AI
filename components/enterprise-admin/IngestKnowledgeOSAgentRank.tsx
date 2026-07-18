import type { KnowledgeOSHealthTarget } from "@/lib/enterprise/knowledge-os-dashboard-client";
import {
  formatKnowledgeOSPercent,
  IngestKnowledgeOSStatusBadge,
  knowledgeOSRiskTone
} from "@/components/enterprise-admin/IngestKnowledgeOSMetricCard";

function riskLabel(risk?: string) {
  if (risk === "low") return "低风险";
  if (risk === "medium") return "中风险";
  if (risk === "high") return "高风险";
  if (risk === "critical") return "严重";

  return "未知";
}

function recommendation(item: KnowledgeOSHealthTarget) {
  if (item.riskLevel === "critical" || item.readiness === "blocked") {
    return "优先人工复核";
  }

  if ((item.reviewRequiredCount ?? 0) > 0 || (item.lowQualityCount ?? 0) > 0) {
    return "建议优化知识质量";
  }

  if ((item.unknownMetadataCount ?? 0) > 0) {
    return "建议补齐治理元数据";
  }

  return "保持观察";
}

export function IngestKnowledgeOSAgentRank({ agents }: { agents?: KnowledgeOSHealthTarget[] }) {
  const sorted = [...(agents ?? [])].sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0));

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202020]">Agent 健康排行</h2>
          <p className="mt-1 text-sm text-[#7a7a74]">按 healthScore 从高到低排序。</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#f7f7f6] px-4 py-5 text-sm text-[#777]">暂无 Agent 健康数据。</p>
      ) : (
        <div className="mt-5 space-y-3">
          {sorted.slice(0, 8).map((agent, index) => (
            <div key={`${agent.agentId ?? agent.id ?? index}`} className="rounded-2xl border border-[#efefed] bg-[#fbfbfa] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#202020] text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-[#202020]">{agent.name || agent.agentId || "Unknown Agent"}</p>
                  </div>
                  <p className="mt-2 truncate text-xs text-[#8a8a84]">
                    {agent.agentId || "unknown"} · KB {agent.knowledgeBaseCount ?? 1} · chunks {agent.chunkCount ?? 0}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IngestKnowledgeOSStatusBadge label={riskLabel(agent.riskLevel)} tone={knowledgeOSRiskTone(agent.riskLevel)} />
                  <span className="text-sm font-semibold text-[#202020]">{formatKnowledgeOSPercent(agent.healthScore)}</span>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ececea]">
                <div
                  className="h-full rounded-full bg-[#202020]"
                  style={{ width: formatKnowledgeOSPercent(agent.healthScore) }}
                />
              </div>
              <p className="mt-3 text-xs text-[#777]">{recommendation(agent)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
