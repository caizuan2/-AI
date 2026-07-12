"use client";

import Link from "next/link";
import { ArrowRight, Award, Bot, Target, TrendingUp, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiCoachSectionNavigation } from "@/apps/team-os/features/ai-coach/components/AiCoachSectionNavigation";
import { AiCoachEmptyState, AiCoachErrorState, AiCoachLoadingState } from "@/apps/team-os/features/ai-coach/components/AiCoachState";
import { CoachTeamSelector } from "@/apps/team-os/features/ai-coach/components/CoachTeamSelector";
import { useCoachDashboard } from "@/apps/team-os/features/ai-coach/hooks/useCoachDashboard";

export function AiCoachDashboardPage() {
  const { data, loading, error, reload, selectTeam, activeTeamId } = useCoachDashboard();
  const maxProblemCount = Math.max(1, ...data.problemStats.map((item) => item.count));
  const metrics = data.canViewTeam ? [
    { label: "今日已分析", value: data.analyzedCount, suffix: "人", icon: UsersRound },
    { label: "团队平均分", value: data.analyzedCount > 0 ? data.averageScore : "—", suffix: data.analyzedCount > 0 ? "分" : "", icon: TrendingUp },
    { label: "待关注问题", value: data.problemStats.length, suffix: "项", icon: Target },
    { label: "我的今日评分", value: data.currentUserReport?.score ?? "—", suffix: data.currentUserReport ? "分" : "", icon: Award }
  ] : [
    { label: "我的今日分析", value: data.analyzedCount, suffix: "份", icon: Bot },
    { label: "我的今日评分", value: data.currentUserReport?.score ?? "—", suffix: data.currentUserReport ? "分" : "", icon: Award },
    { label: "我的待改进问题", value: data.problemStats.length, suffix: "项", icon: Target },
    { label: "我的可用团队", value: data.teams.length, suffix: "个", icon: UsersRound }
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">AI 员工教练系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">AI 教练中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">用五维销售能力模型分析客户沟通，生成可执行的员工成长建议。</p></div>
        <div className="flex flex-wrap gap-3">
          <Link href="/team-os/ai-coach/team" className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50">团队成长</Link>
          <Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Bot className="h-4 w-4" />提交分析</Link>
        </div>
      </div>

      <AiCoachSectionNavigation />
      <CoachTeamSelector teams={data.teams} value={activeTeamId} disabled={loading} onChange={selectTeam} />

      {loading ? <AiCoachLoadingState /> : error ? <AiCoachErrorState message={error} onRetry={() => void reload()} /> : data.teams.length === 0 ? (
        <AiCoachEmptyState title="尚未加入可用团队" description="请先在组织管理中加入启用团队，再使用 AI 教练。" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return <Card key={metric.label}><CardContent className="flex items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{metric.value}<span className="ml-1 text-sm font-medium text-slate-500">{metric.suffix}</span></p><p className="text-xs text-slate-500">{metric.label}</p></div></CardContent></Card>;
            })}
          </div>

          {data.analyzedCount === 0 ? (
            <AiCoachEmptyState title="今日还没有成长报告" description="提交一段客户沟通记录，AI 将结合员工可访问知识生成五维评分和训练计划。" action={<Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">开始首次分析</Link>} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{data.canViewTeam ? "员工今日排名" : "我的今日分析"}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.canViewTeam ? data.rankings.map((item) => (
                    <Link key={item.reportId} href={`/team-os/ai-coach/report/${encodeURIComponent(item.reportId)}`} className="focus-ring flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                      <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${item.rank <= 3 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{item.rank}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.employeeName}</span>
                      <Badge className="bg-indigo-50 text-indigo-700">{item.score} 分</Badge>
                    </Link>
                  )) : data.currentUserReport ? (
                    <Link href={`/team-os/ai-coach/report/${encodeURIComponent(data.currentUserReport.id)}`} className="focus-ring flex items-center gap-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><span className="text-3xl font-semibold text-indigo-800">{data.currentUserReport.score}</span><span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">查看我的成长报告</span><span className="line-clamp-1 text-xs text-slate-500">{data.currentUserReport.summary}</span></span><ArrowRight className="h-4 w-4 text-indigo-700" /></Link>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>高频问题统计</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {data.problemStats.length > 0 ? data.problemStats.map((item) => (
                    <div key={item.problem} className="space-y-2"><div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-700">{item.problem}</span><span className="whitespace-nowrap text-xs text-slate-500">{item.count} 次</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${item.problem}出现次数`} aria-valuemin={0} aria-valuemax={maxProblemCount} aria-valuenow={item.count}><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.count / maxProblemCount) * 100}%` }} /></div></div>
                  )) : <p className="py-8 text-center text-sm text-slate-500">今日暂无显著问题统计。</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
