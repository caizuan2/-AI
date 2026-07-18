"use client";

import * as React from "react";
import { Activity, BrainCircuit, CheckCircle2, GraduationCap, TrendingUp } from "lucide-react";
import { AnalyticsCoverageNotice, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsForbiddenState, AnalyticsLoadingState } from "@/apps/team-os/features/analytics/components/AnalyticsState";
import { AnalyticsMetricCard } from "@/apps/team-os/features/analytics/components/AnalyticsMetricCard";
import { AnalyticsPageHeader } from "@/apps/team-os/features/analytics/components/AnalyticsPageHeader";
import { AnalyticsScopeSelector } from "@/apps/team-os/features/analytics/components/AnalyticsScopeSelector";
import { AnalyticsSectionNavigation } from "@/apps/team-os/features/analytics/components/AnalyticsSectionNavigation";
import { AnalyticsTrendChart } from "@/apps/team-os/features/analytics/components/AnalyticsCharts";
import { BusinessInsightPanel } from "@/apps/team-os/features/analytics/components/BusinessInsightPanel";
import { useAnalyticsDashboard } from "@/apps/team-os/features/analytics/hooks/useAnalyticsData";
import type { AnalyticsRangeDays } from "@/apps/team-os/features/analytics/types";
import { formatAnalyticsDateTime } from "@/apps/team-os/features/analytics/utils/analytics-format";

export function AnalyticsDashboardPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [days, setDays] = React.useState<AnalyticsRangeDays>(30);
  const dashboard = useAnalyticsDashboard(companyId, days);
  const data = dashboard.data;
  const forbidden = dashboard.error?.code === "FORBIDDEN";
  const hasData = data ? Object.values(data.metrics).some((metric) => metric.available && metric.value !== null) : false;
  const heading = data?.context.scopeMode === "SELF"
    ? { title: "我的成长数据", description: "查看本人任务、能力与培训聚合指标；不会展示其他员工或企业经营数据。" }
    : data?.context.scopeMode === "TRAINING"
      ? { title: "培训数据概览", description: "查看当前培训权限范围内的课程与训练指标，其他经营领域保持不可用。" }
      : data?.context.scopeMode === "TEAM"
        ? { title: "团队运营看板", description: "统一查看所管理团队的任务、员工成长、客户、培训与可追踪 AI 指标。" }
        : { title: "企业运营驾驶舱", description: "统一查看任务执行、员工成长、客户成交占比、培训效果与可追踪 AI 指标。所有数据均按当前账号权限聚合。" };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AnalyticsPageHeader eyebrow="AI Analytics Center" title={heading.title} description={heading.description} />

      {dashboard.loading ? <AnalyticsLoadingState /> : forbidden ? <AnalyticsForbiddenState description="当前账号尚未加入可用企业或没有数据分析权限。" /> : dashboard.error && !data ? <AnalyticsErrorState message={dashboard.error.message} onRetry={() => void dashboard.reload()} /> : !data ? <AnalyticsEmptyState title="运营数据暂不可用" description="请确认当前账号已加入启用的企业团队。" /> : (
        <>
          <AnalyticsSectionNavigation permissions={data.context.permissions} />
          <AnalyticsScopeSelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} scopeMode={data.context.scopeMode} days={data.range.days} onCompanyChange={setCompanyId} onDaysChange={setDays} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <AnalyticsMetricCard label="今日任务完成率" value={data.metrics.taskCompletionRate.value} unit={data.metrics.taskCompletionRate.unit} available={data.metrics.taskCompletionRate.available} sampleSize={data.metrics.taskCompletionRate.sampleSize} description={data.metrics.taskCompletionRate.definition} icon={CheckCircle2} accent="indigo" />
            <AnalyticsMetricCard label="员工平均能力分" value={data.metrics.employeeAverageScore.value} unit={data.metrics.employeeAverageScore.unit} available={data.metrics.employeeAverageScore.available} sampleSize={data.metrics.employeeAverageScore.sampleSize} description={data.metrics.employeeAverageScore.definition} icon={TrendingUp} accent="emerald" />
            <AnalyticsMetricCard label="当前客户成交占比" value={data.metrics.customerConversionRate.value} unit={data.metrics.customerConversionRate.unit} available={data.metrics.customerConversionRate.available} sampleSize={data.metrics.customerConversionRate.sampleSize} description={data.metrics.customerConversionRate.definition} icon={Activity} accent="amber" />
            <AnalyticsMetricCard label="培训完成率" value={data.metrics.trainingCompletionRate.value} unit={data.metrics.trainingCompletionRate.unit} available={data.metrics.trainingCompletionRate.available} sampleSize={data.metrics.trainingCompletionRate.sampleSize} description={data.metrics.trainingCompletionRate.definition} icon={GraduationCap} accent="sky" />
            <AnalyticsMetricCard label="AI 调用次数" value={data.metrics.aiUsageCount.value} unit={data.metrics.aiUsageCount.unit} available={data.metrics.aiUsageCount.available} sampleSize={data.metrics.aiUsageCount.sampleSize} description={data.metrics.aiUsageCount.definition} icon={BrainCircuit} accent="violet" />
          </div>

          {!hasData ? <AnalyticsEmptyState title="当前区间暂无可分析数据" description="指标为 0 与暂无数据会被分别展示；可切换统计区间后重试。" /> : null}

          <AnalyticsTrendChart
            title="核心经营指标趋势"
            description={`${data.range.label}内的任务、成长、客户与培训百分制趋势。缺失日期不会按 0 处理。`}
            maxValue={100}
            series={[
              { label: "任务完成率", color: "#4f46e5", points: data.trend.map((point) => ({ date: point.date, value: point.taskCompletionRate })) },
              { label: "员工能力分", color: "#059669", points: data.trend.map((point) => ({ date: point.date, value: point.employeeAverageScore })) },
              { label: "当前客户成交占比", color: "#d97706", points: data.trend.map((point) => ({ date: point.date, value: point.customerConversionRate })) },
              { label: "培训完成率", color: "#0284c7", points: data.trend.map((point) => ({ date: point.date, value: point.trainingCompletionRate })) }
            ]}
          />

          <BusinessInsightPanel companyId={data.context.companyId} days={data.range.days} allowed={data.context.permissions.canGenerateBusinessInsight} hasData={hasData} />
          <AnalyticsCoverageNotice coverage={data.dataCoverage} />
          <p className="text-right text-xs text-slate-400">数据生成时间：{formatAnalyticsDateTime(data.generatedAt)}</p>
        </>
      )}
    </div>
  );
}
