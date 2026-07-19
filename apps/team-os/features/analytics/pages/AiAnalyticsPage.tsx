"use client";

import * as React from "react";
import { Bot, BrainCircuit, DatabaseZap, Lightbulb, MessagesSquare, Sparkles } from "lucide-react";
import { AnalyticsTrendChart } from "@/apps/team-os/features/analytics/components/AnalyticsCharts";
import { AnalyticsMetricCard } from "@/apps/team-os/features/analytics/components/AnalyticsMetricCard";
import { AnalyticsPageHeader } from "@/apps/team-os/features/analytics/components/AnalyticsPageHeader";
import { AnalyticsScopeSelector } from "@/apps/team-os/features/analytics/components/AnalyticsScopeSelector";
import { AnalyticsSectionNavigation } from "@/apps/team-os/features/analytics/components/AnalyticsSectionNavigation";
import { AnalyticsCoverageNotice, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsForbiddenState, AnalyticsLoadingState } from "@/apps/team-os/features/analytics/components/AnalyticsState";
import { useAiAnalytics } from "@/apps/team-os/features/analytics/hooks/useAnalyticsData";
import type { AnalyticsRangeDays } from "@/apps/team-os/features/analytics/types";

export function AiAnalyticsPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [days, setDays] = React.useState<AnalyticsRangeDays>(30);
  const analytics = useAiAnalytics(companyId, days);
  const data = analytics.data;
  const forbidden = analytics.error?.code === "FORBIDDEN";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AnalyticsPageHeader eyebrow="AI Operations Analytics" title="AI 运营分析" description="查看 AI 教练、CRM 分析、培训评估与可采集知识调用的使用趋势，明确数据覆盖边界。" />
      {analytics.loading ? <AnalyticsLoadingState label="正在汇总 AI 使用情况…" /> : forbidden ? <AnalyticsForbiddenState description="AI 运营分析仅向企业负责人和具备对应团队管理权限的主管开放。" /> : analytics.error && !data ? <AnalyticsErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} /> : !data ? <AnalyticsEmptyState title="AI 运营分析暂不可用" description="请确认当前账号拥有 AI 使用数据查看权限。" /> : !data.context.permissions.canViewAiAnalytics ? <AnalyticsForbiddenState description="当前角色没有 AI 运营聚合数据查看权限。" /> : (
        <>
          <AnalyticsSectionNavigation permissions={data.context.permissions} />
          <AnalyticsScopeSelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} scopeMode={data.context.scopeMode} days={data.range.days} onCompanyChange={setCompanyId} onDaysChange={setDays} />
          <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-800">当前口径：{data.scopeLabel}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnalyticsMetricCard label="可追踪 AI 输出" value={data.trackedOutputCount} icon={BrainCircuit} description="教练报告、CRM 画像更新与培训评估合计" accent="violet" />
            <AnalyticsMetricCard label="教练成长报告" value={data.coachReportCount} icon={MessagesSquare} description="统计区间内形成的员工成长报告" accent="indigo" />
            <AnalyticsMetricCard label="CRM 画像更新覆盖" value={data.crmProfileCount} icon={Bot} description="区间内发生更新且当前保留的画像行数，不代表调用次数" accent="sky" />
            <AnalyticsMetricCard label="培训评估" value={data.trainingEvaluationCount} icon={Sparkles} description="统计区间内形成的 AI 模拟训练评估" accent="emerald" />
            <AnalyticsMetricCard label="真实 Provider 调用" value={data.aiUsageCount} available={data.aiUsageCount !== null} icon={DatabaseZap} description="现有数据无法可靠按企业归因时保持不可用" accent="amber" />
            <AnalyticsMetricCard label="知识库调用" value={data.knowledgeCallCount} available={data.knowledgeCallCount !== null} icon={DatabaseZap} description="仅在存在可按企业归因的可靠审计记录时展示" accent="amber" />
          </div>
          <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
            <AnalyticsTrendChart title="AI 使用趋势" description="按日期拆分教练、CRM 与培训 AI 分析输出，统计为 0 的日期仍保留。" series={[
              { label: "AI 教练", color: "#4f46e5", points: data.usageTrend.map((point) => ({ date: point.date, value: point.coachReportCount })) },
              { label: "CRM 画像更新", color: "#0284c7", points: data.usageTrend.map((point) => ({ date: point.date, value: point.crmProfileUpdateCount })) },
              { label: "培训评估", color: "#059669", points: data.usageTrend.map((point) => ({ date: point.date, value: point.trainingEvaluationCount })) }
            ]} />
            <AnalyticsMetricCard label="AI 建议执行率" value={data.suggestionExecutionRate} unit="PERCENT" available={data.suggestionExecutionRate !== null} icon={Lightbulb} description="仅在建议执行状态可被可靠追踪时展示；不可追踪不按 0 计算" accent="rose" />
          </div>
          {data.trackedOutputCount === 0 ? <AnalyticsEmptyState title="当前区间暂无可追踪 AI 输出" description="完成 AI 教练或模拟训练后，这里会形成可审计的输出统计；CRM 画像覆盖与区间更新会分别标注。" /> : null}
          {data.unavailableMetrics.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note"><p className="font-semibold">暂不可用指标</p><ul className="mt-2 list-disc space-y-1 pl-5">{data.unavailableMetrics.map((metric, index) => <li key={`${metric}-${index}`}>{metric}</li>)}</ul></div> : null}
          <AnalyticsCoverageNotice coverage={data.dataCoverage} />
        </>
      )}
    </div>
  );
}
