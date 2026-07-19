"use client";

import * as React from "react";
import { Award, Brain, BriefcaseBusiness, GraduationCap, Target, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsBarList, AnalyticsTrendChart } from "@/apps/team-os/features/analytics/components/AnalyticsCharts";
import { AnalyticsCoverageNotice, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsForbiddenState, AnalyticsLoadingState } from "@/apps/team-os/features/analytics/components/AnalyticsState";
import { AnalyticsPageHeader } from "@/apps/team-os/features/analytics/components/AnalyticsPageHeader";
import { AnalyticsScopeSelector } from "@/apps/team-os/features/analytics/components/AnalyticsScopeSelector";
import { AnalyticsSectionNavigation } from "@/apps/team-os/features/analytics/components/AnalyticsSectionNavigation";
import { useTeamAnalytics } from "@/apps/team-os/features/analytics/hooks/useAnalyticsData";
import type { AnalyticsRangeDays, EmployeeGrowthItem } from "@/apps/team-os/features/analytics/types";
import { formatAnalyticsNumber } from "@/apps/team-os/features/analytics/utils/analytics-format";

export function TeamAnalyticsPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [days, setDays] = React.useState<AnalyticsRangeDays>(30);
  const analytics = useTeamAnalytics(companyId, days);
  const data = analytics.data;
  const forbidden = analytics.error?.code === "FORBIDDEN";
  const personalOnly = data ? !data.context.permissions.canViewTeamAnalytics && data.context.permissions.canViewPersonalGrowth : false;
  const allowed = data ? data.context.permissions.canViewTeamAnalytics || data.context.permissions.canViewPersonalGrowth : false;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AnalyticsPageHeader eyebrow="Team Analytics" title={personalOnly ? "我的成长分析" : "团队与员工成长分析"} description={personalOnly ? "基于本人 AI 教练与授权培训聚合指标查看个人成长趋势。" : "查看团队排名、员工成长趋势与能力结构，快速定位优势和成长机会。"} />
      {analytics.loading ? <AnalyticsLoadingState label="正在计算团队成长指标…" /> : forbidden ? <AnalyticsForbiddenState description="团队分析仅向企业负责人、团队主管及可查看个人成长的员工开放。" /> : analytics.error && !data ? <AnalyticsErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} /> : !data ? <AnalyticsEmptyState title="团队分析暂不可用" description="请确认当前账号具备有效团队关系。" /> : !allowed ? <AnalyticsForbiddenState description="当前角色没有团队或个人成长数据查看权限。" /> : (
        <>
          <AnalyticsSectionNavigation permissions={data.context.permissions} />
          <AnalyticsScopeSelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} scopeMode={data.context.scopeMode} days={data.range.days} onCompanyChange={setCompanyId} onDaysChange={setDays} />

          {data.rankings.length === 0 ? <AnalyticsEmptyState title="当前区间暂无员工成长数据" description="完成任务、AI 教练分析或培训后，这里会形成可解释的成长指标。" /> : (
            <section className="space-y-4" aria-labelledby="employee-growth-ranking">
              <div><h2 id="employee-growth-ranking" className="text-xl font-semibold text-slate-950">{personalOnly ? "我的能力概览" : "员工成长排名"}</h2><p className="mt-1 text-sm text-slate-500">每项得分均保留数据来源数量，暂无样本不会按 0 分计算。</p></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.rankings.map((item, index) => <EmployeeGrowthCard key={`${item.teamId}-${item.userId}`} item={item} rank={personalOnly ? undefined : index + 1} />)}
              </div>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <AnalyticsBarList title="能力分布" description="按当前权限范围统计 AI Coach 技能维度平均分（单项 20 分制）。" items={data.abilityDistribution} unit="SCORE" maxValue={20} />
            <AnalyticsTrendChart title={personalOnly ? "我的成长趋势" : "员工提升趋势"} description={personalOnly ? "本人综合能力与培训成绩的区间趋势。" : "员工综合能力与培训成绩的区间趋势。"} maxValue={100} series={[
              { label: personalOnly ? "我的能力分" : "员工平均分", color: "#4f46e5", points: data.growthTrend.map((point) => ({ date: point.date, value: point.employeeAverageScore })) },
              { label: "培训平均分", color: "#059669", points: data.growthTrend.map((point) => ({ date: point.date, value: point.trainingAverageScore })) }
            ]} />
          </div>
          <AnalyticsCoverageNotice coverage={data.dataCoverage} truncated={data.truncated} />
        </>
      )}
    </div>
  );
}

function EmployeeGrowthCard({ item, rank }: { item: EmployeeGrowthItem; rank?: number }) {
  const scores = [
    { label: "成长", value: item.growthScore, icon: Award },
    { label: "能力", value: item.skillScore, icon: Brain },
    { label: "任务", value: item.taskScore, icon: Target },
    { label: "培训", value: item.trainingScore, icon: GraduationCap },
    { label: "客户", value: item.customerScore, icon: BriefcaseBusiness }
  ];
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          {rank ? <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${rank <= 3 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{rank}</span> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700"><UsersRound className="h-4 w-4" /></span>}
          <div className="min-w-0 flex-1"><CardTitle className="truncate" title={item.employeeName}>{item.employeeName}</CardTitle><p className="mt-1 truncate text-xs text-slate-500" title={item.teamName}>{item.teamName}</p></div>
          <Badge variant={item.growthLevel === "需关注" ? "warning" : "secondary"}>{item.growthLevel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {scores.map((score) => { const Icon = score.icon; return <div key={score.label} className="rounded-lg bg-slate-50 p-3 text-center"><Icon className="mx-auto h-4 w-4 text-slate-400" /><p className="mt-2 font-semibold tabular-nums text-slate-900">{formatAnalyticsNumber(score.value, "SCORE")}</p><p className="mt-1 text-xs text-slate-500">{score.label}</p></div>; })}
        </div>
        <p className="text-xs leading-5 text-slate-500">数据样本：教练 {item.sources.coachReports} · 任务 {item.sources.taskSubmissions} · 培训 {item.sources.trainingRecords} · 客户 {item.sources.customerProfiles}</p>
      </CardContent>
    </Card>
  );
}
