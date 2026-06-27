"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import {
  fetchKnowledgeOSDashboard,
  type KnowledgeOSApiResult,
  type KnowledgeOSDashboardData,
  type KnowledgeOSHealthTarget
} from "@/lib/enterprise/knowledge-os-dashboard-client";
import {
  formatKnowledgeOSPercent,
  IngestKnowledgeOSMetricCard,
  IngestKnowledgeOSStatusBadge,
  knowledgeOSReadinessTone,
  knowledgeOSRiskTone
} from "@/components/enterprise-admin/IngestKnowledgeOSMetricCard";
import { IngestKnowledgeOSAgentRank } from "@/components/enterprise-admin/IngestKnowledgeOSAgentRank";
import { IngestKnowledgeOSRiskMap } from "@/components/enterprise-admin/IngestKnowledgeOSRiskMap";
import { IngestKnowledgeOSLifecyclePanel } from "@/components/enterprise-admin/IngestKnowledgeOSLifecyclePanel";
import { IngestKnowledgeOSTrendPanel } from "@/components/enterprise-admin/IngestKnowledgeOSTrendPanel";
import { IngestKnowledgeOSPolicyPanel } from "@/components/enterprise-admin/IngestKnowledgeOSPolicyPanel";

type DashboardLoadState = {
  loading: boolean;
  data: KnowledgeOSDashboardData | null;
  error: string;
};

function fallbackRelease(data: KnowledgeOSDashboardData | null) {
  return data?.dataCore.data
    ? data.release.data
    : data?.release.data
    ?? data?.policy.data?.release
    ?? data?.lifecycle.data?.release
    ?? data?.trends.data?.release
    ?? data?.optimize.data?.release
    ?? null;
}

function statusText(readiness?: string) {
  if (readiness === "ready") return "Ready";
  if (readiness === "warning") return "Warning";
  if (readiness === "blocked") return "Blocked";

  return "Unknown";
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function sumDistribution(distribution: Record<string, number> | undefined, keys: string[]) {
  return keys.reduce((sum, key) => sum + numberValue(distribution?.[key], 0), 0);
}

function apiStatusLabel(result: KnowledgeOSApiResult<unknown>, label: string) {
  if (result.ok) {
    return { label, status: "已连接", tone: "green" as const };
  }

  if (result.status === "unauthenticated") {
    return { label, status: "请先登录", tone: "yellow" as const };
  }

  if (result.status === "forbidden") {
    return { label, status: "无权限", tone: "red" as const };
  }

  if (result.status === "not_found") {
    return { label, status: "接口未就绪", tone: "gray" as const };
  }

  return { label, status: "降级", tone: "gray" as const };
}

function KnowledgeBaseHealthList({ knowledgeBases }: { knowledgeBases?: KnowledgeOSHealthTarget[] }) {
  const sorted = [...(knowledgeBases ?? [])].sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0));

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-[#202020]">知识库健康度</h2>
      <p className="mt-1 text-sm text-[#7a7a74]">按 knowledgeBaseId / namespace 聚合。</p>
      {sorted.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#f7f7f6] px-4 py-5 text-sm text-[#777]">暂无 KnowledgeBase 健康数据。</p>
      ) : (
        <div className="mt-5 space-y-3">
          {sorted.slice(0, 8).map((kb, index) => (
            <div key={`${kb.knowledgeBaseId ?? kb.id ?? index}:${kb.namespace ?? ""}`} className="rounded-2xl border border-[#efefed] bg-[#fbfbfa] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#202020]">{kb.knowledgeBaseId || kb.name || "Unknown KnowledgeBase"}</p>
                  <p className="mt-1 truncate text-xs text-[#8a8a84]">{kb.namespace || "default"} · chunks {kb.chunkCount ?? 0}</p>
                  <p className="mt-2 text-xs text-[#777]">
                    高价值 {kb.highValueCount ?? 0} · 低质量 {kb.lowQualityCount ?? 0} · 需复核 {kb.reviewRequiredCount ?? 0}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <IngestKnowledgeOSStatusBadge label={kb.riskLevel ?? "unknown"} tone={knowledgeOSRiskTone(kb.riskLevel)} />
                  <p className="mt-2 text-sm font-semibold text-[#202020]">{formatKnowledgeOSPercent(kb.healthScore)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ececea]">
                <div className="h-full rounded-full bg-[#202020]" style={{ width: formatKnowledgeOSPercent(kb.healthScore) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function IngestKnowledgeOSDashboard({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<DashboardLoadState>({
    loading: true,
    data: null,
    error: ""
  });

  async function loadDashboard() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const data = await fetchKnowledgeOSDashboard();
    const firstError = [data.dataCore, data.release, data.policy, data.lifecycle, data.trends, data.optimize].find((item) => !item.ok)?.message ?? "";

    setState({
      loading: false,
      data,
      error: data.release.ok ? "" : firstError
    });
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const release = fallbackRelease(state.data);
  const core = state.data?.dataCore.data ?? null;
  const distributions = core?.distributions ?? state.data?.release.data?.distributions;
  const summary = core?.summary ?? state.data?.release.data?.summary;
  const apiStatuses = useMemo(() => {
    if (!state.data) return [];

    return [
      apiStatusLabel(state.data.dataCore, "Data Core"),
      apiStatusLabel(state.data.release, "Release"),
      apiStatusLabel(state.data.policy, "Policy"),
      apiStatusLabel(state.data.lifecycle, "Lifecycle"),
      apiStatusLabel(state.data.trends, "Trends"),
      apiStatusLabel(state.data.optimize, "Optimize")
    ];
  }, [state.data]);
  const riskMap = {
    highRiskChunks: numberValue(summary?.highRiskCount) + numberValue(summary?.criticalRiskCount),
    lowQualityChunks: numberValue(summary?.lowQualityCount),
    policyReviewRequiredCount: numberValue(summary?.reviewRequiredCount),
    lifecycleArchiveCandidateCount: numberValue(summary?.archiveCandidateCount),
    unknownMetadataCount: numberValue(summary?.unknownMetadataCount),
    decliningTrendCount: sumDistribution(distributions?.lifecycle, ["declining"]) + sumDistribution(distributions?.trend, ["declining"])
  };

  return (
    <main className="h-full overflow-y-auto bg-[#f7f7f6] px-5 py-8 text-[#202020]">
      <div className="mx-auto w-full max-w-[1180px] pb-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e6e6e3] bg-white text-[#555] shadow-sm transition hover:text-[#202020]"
                aria-label="返回对话"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[#777]">
                <ShieldCheck className="h-4 w-4" />
                Knowledge OS
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#202020]">AI总控运营控制台</h1>
              <p className="mt-2 text-sm leading-6 text-[#777]">聚合 Release / Policy / Lifecycle / Trend / Optimize 的只读运营状态。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={state.loading}
            className="inline-flex items-center gap-2 rounded-full border border-[#dededb] bg-white px-4 py-2 text-sm font-semibold text-[#202020] shadow-sm transition hover:bg-[#f3f3f2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {apiStatuses.map((item) => (
            <IngestKnowledgeOSStatusBadge key={item.label} label={`${item.label} · ${item.status}`} tone={item.tone} />
          ))}
          {core ? (
            <IngestKnowledgeOSStatusBadge label={`Data Quality · ${core.dataQuality}`} tone={core.dataQuality === "real" ? "green" : core.dataQuality === "partial" ? "yellow" : "gray"} />
          ) : null}
        </div>

        {state.error ? (
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {state.error}
          </div>
        ) : null}

        {state.loading ? (
          <div className="mt-8 rounded-3xl border border-[#ececea] bg-white p-8 text-sm text-[#777] shadow-sm">
            正在读取 Knowledge OS 运营状态...
          </div>
        ) : !release ? (
          <div className="mt-8 rounded-3xl border border-[#ececea] bg-white p-8 text-sm text-[#777] shadow-sm">
            暂无数据，系统需要更多投喂和用户行为后生成分析。
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <IngestKnowledgeOSMetricCard
                title="系统健康度"
                value={formatKnowledgeOSPercent(release.systemHealthScore)}
                description={core ? "Data Core 统一聚合 RAG、Agent、知识库、Policy 与趋势信号。" : "综合 RAG、Agent、知识库、Policy 与趋势信号。"}
                tone="blue"
              />
              <IngestKnowledgeOSMetricCard
                title="发布状态"
                value={statusText(release.releaseReadiness)}
                description="ready / warning / blocked / unknown。"
                tone={knowledgeOSReadinessTone(release.releaseReadiness)}
                footer={<IngestKnowledgeOSStatusBadge label={release.releaseReadiness ?? "unknown"} tone={knowledgeOSReadinessTone(release.releaseReadiness)} />}
              />
              <IngestKnowledgeOSMetricCard
                title="风险指数"
                value={formatKnowledgeOSPercent(release.riskIndex)}
                description="风险越高越需要人工复核。"
                tone={knowledgeOSRiskTone(release.riskLevel)}
                footer={<IngestKnowledgeOSStatusBadge label={release.riskLevel ?? "unknown"} tone={knowledgeOSRiskTone(release.riskLevel)} />}
              />
              <IngestKnowledgeOSMetricCard
                title="RAG 健康度"
                value={formatKnowledgeOSPercent(release.ragHealthScore)}
                description={`Chunks ${summary?.totalChunks ?? 0} · Unknown ${summary?.unknownMetadataCount ?? 0}`}
                tone="green"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <IngestKnowledgeOSAgentRank agents={state.data?.release.data?.agents} />
              <KnowledgeBaseHealthList knowledgeBases={state.data?.release.data?.knowledgeBases} />
            </div>

            <IngestKnowledgeOSRiskMap risks={riskMap} />

            <div className="grid gap-5 xl:grid-cols-2">
              <IngestKnowledgeOSLifecyclePanel distribution={distributions?.lifecycle} />
              <IngestKnowledgeOSTrendPanel distribution={distributions?.trend} />
            </div>

            <IngestKnowledgeOSPolicyPanel distribution={distributions?.policy} />
          </div>
        )}
      </div>
    </main>
  );
}
