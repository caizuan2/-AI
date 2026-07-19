"use client";

import * as React from "react";
import { Award, BookOpenCheck, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsTrendChart } from "@/apps/team-os/features/analytics/components/AnalyticsCharts";
import { AnalyticsMetricCard } from "@/apps/team-os/features/analytics/components/AnalyticsMetricCard";
import { AnalyticsPageHeader } from "@/apps/team-os/features/analytics/components/AnalyticsPageHeader";
import { AnalyticsScopeSelector } from "@/apps/team-os/features/analytics/components/AnalyticsScopeSelector";
import { AnalyticsSectionNavigation } from "@/apps/team-os/features/analytics/components/AnalyticsSectionNavigation";
import { AnalyticsCoverageNotice, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsForbiddenState, AnalyticsLoadingState } from "@/apps/team-os/features/analytics/components/AnalyticsState";
import { useTrainingAnalytics } from "@/apps/team-os/features/analytics/hooks/useAnalyticsData";
import type { AnalyticsRangeDays } from "@/apps/team-os/features/analytics/types";
import { clampPercent, formatAnalyticsNumber } from "@/apps/team-os/features/analytics/utils/analytics-format";

export function TrainingAnalyticsPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [days, setDays] = React.useState<AnalyticsRangeDays>(30);
  const analytics = useTrainingAnalytics(companyId, days);
  const data = analytics.data;
  const forbidden = analytics.error?.code === "FORBIDDEN";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AnalyticsPageHeader eyebrow="Training Analytics" title="培训效果分析" description="查看课程安排、完成率、训练评分与员工提升趋势，为培训计划提供量化依据。" />
      {analytics.loading ? <AnalyticsLoadingState label="正在计算培训效果…" /> : forbidden ? <AnalyticsForbiddenState description="培训分析向企业负责人、主管和培训师开放，并严格限制在授权团队范围。" /> : analytics.error && !data ? <AnalyticsErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} /> : !data ? <AnalyticsEmptyState title="培训分析暂不可用" description="请确认当前账号拥有培训数据查看权限。" /> : !data.context.permissions.canViewTrainingAnalytics ? <AnalyticsForbiddenState description="当前角色没有培训聚合数据查看权限。" /> : (
        <>
          <AnalyticsSectionNavigation permissions={data.context.permissions} />
          <AnalyticsScopeSelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} scopeMode={data.context.scopeMode} days={data.range.days} onCompanyChange={setCompanyId} onDaysChange={setDays} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsMetricCard label="培训安排" value={data.assignmentCount} icon={BookOpenCheck} description="统计区间内截止且未取消的培训安排" accent="indigo" />
            <AnalyticsMetricCard label="已完成安排" value={data.completedAssignmentCount} icon={CheckCircle2} description="已完成的培训安排数量" accent="emerald" />
            <AnalyticsMetricCard label="课程完成率" value={data.completionRate} unit="PERCENT" icon={ClipboardCheck} description="完成安排占有效安排比例" accent="sky" />
            <AnalyticsMetricCard label="平均训练分" value={data.averageScore} unit="SCORE" sampleSize={data.scoredRecordCount} icon={Award} description="已完成训练记录所保存历史最佳分的平均值" accent="amber" />
          </div>

          {data.assignmentCount === 0 && data.evaluatedCount === 0 ? <AnalyticsEmptyState title="当前区间暂无培训结果" description="安排课程并完成 AI 模拟训练后，这里会形成培训效果指标。" /> : (
            <>
              <section className="space-y-4" aria-labelledby="course-performance"><div><h2 id="course-performance" className="text-xl font-semibold text-slate-950">课程效果</h2><p className="mt-1 text-sm text-slate-500">按课程查看安排完成率与有效评分。</p></div>{data.coursePerformance.length === 0 ? <AnalyticsEmptyState title="暂无课程效果数据" description="当前区间尚未形成可统计的课程安排。" /> : <div className="grid gap-4 lg:grid-cols-2">{data.coursePerformance.map((course) => <Card key={course.courseId}><CardHeader><CardTitle className="break-words">{course.title}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-3 gap-3 text-center"><CourseMetric label="安排" value={String(course.assignmentCount)} /><CourseMetric label="完成" value={String(course.completedCount)} /><CourseMetric label="平均分" value={formatAnalyticsNumber(course.averageScore, "SCORE")} /></div><div><div className="flex justify-between gap-3 text-xs text-slate-500"><span>完成率</span><span className="font-semibold tabular-nums text-slate-800">{formatAnalyticsNumber(course.completionRate, "PERCENT")}</span></div>{course.completionRate === null ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">暂无可计算完成率的有效安排。</p> : <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${course.title}完成率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.completionRate}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${clampPercent(course.completionRate)}%` }} /></div>}</div></CardContent></Card>)}</div>}</section>
              <AnalyticsTrendChart title="训练尝试分趋势" description="按日期统计有效 AI 训练评估的平均分；题目和评分标准可能不同，不作为培训因果提升结论。" maxValue={100} series={[{ label: "训练平均分", color: "#4f46e5", points: data.improvementTrend.map((point) => ({ date: point.date, value: point.averageScore })) }]} />
            </>
          )}
          <AnalyticsCoverageNotice coverage={data.dataCoverage} truncated={data.truncated} />
        </>
      )}
    </div>
  );
}

function CourseMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="break-words font-semibold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>;
}
