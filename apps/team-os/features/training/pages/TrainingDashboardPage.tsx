"use client";

import * as React from "react";
import Link from "next/link";
import { Award, BookOpenCheck, Bot, CheckCircle2, Clock3, Play, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingCompanySelector } from "@/apps/team-os/features/training/components/TrainingCompanySelector";
import { TrainingSectionNavigation } from "@/apps/team-os/features/training/components/TrainingSectionNavigation";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import { TrainingRecommendationPanel } from "@/apps/team-os/features/training/components/TrainingRecommendationPanel";
import {
  CourseBadges,
  formatTrainingDate,
  TrainingAssignmentBadge,
  TrainingRecordBadge
} from "@/apps/team-os/features/training/components/TrainingBadges";
import { useTrainingDashboard } from "@/apps/team-os/features/training/hooks/useTrainingDashboard";
import { useTrainingRecommendations } from "@/apps/team-os/features/training/hooks/useTrainingRecommendations";
import { startTrainingCourse } from "@/apps/team-os/features/training/services/training-client";

const actionLink = "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50";

export function TrainingDashboardPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const dashboard = useTrainingDashboard(companyId);
  const effectiveCompanyId = companyId ?? dashboard.data?.context.companyId;
  const recommendations = useTrainingRecommendations(effectiveCompanyId, Boolean(dashboard.data && effectiveCompanyId));

  async function handleStart(courseId: string) {
    setActionError(null);
    setStartingId(courseId);
    try {
      await startTrainingCourse(courseId);
      await dashboard.reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "课程启动失败，请重试。");
    } finally {
      setStartingId(null);
    }
  }

  const data = dashboard.data;
  const stats = data ? [
    { label: "已安排课程", value: data.stats.assignedCourses, suffix: "门", icon: BookOpenCheck },
    { label: "学习中", value: data.stats.startedCourses, suffix: "门", icon: Clock3 },
    { label: "已完成", value: data.stats.completedCourses, suffix: "门", icon: CheckCircle2 },
    { label: "成长评分", value: data.records.length > 0 ? data.stats.growthScore : "—", suffix: data.records.length > 0 ? "分" : "", icon: Award }
  ] : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">AI Training Center</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">AI 培训中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">把企业课程、AI 模拟训练、能力评分与个性化推荐串成持续成长闭环。</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/team-os/training/courses" className={actionLink}>课程中心</Link><Link href="/team-os/training/simulation" className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"><Bot className="h-4 w-4" />开始模拟训练</Link></div>
      </div>

      <TrainingSectionNavigation />

      {dashboard.loading ? <TrainingLoadingState /> : dashboard.error && !data ? (
        <TrainingErrorState message={dashboard.error.message} onRetry={() => void dashboard.reload()} />
      ) : !data ? (
        <TrainingEmptyState title="培训中心暂不可用" description="请确认当前账号已加入启用的企业团队。" />
      ) : (
        <>
          <TrainingCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} disabled={dashboard.loading} onChange={setCompanyId} />
          {dashboard.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{dashboard.error.message}</p> : null}
          {data.truncated ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">培训记录超过首页展示上限，当前统计基于最近 200 门课程和最近 100 条技能记录。</p> : null}
          {actionError ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{actionError}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => { const Icon = stat.icon; return <Card key={stat.label}><CardContent className="flex items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold">{stat.value}<span className="ml-1 text-sm font-medium text-slate-500">{stat.suffix}</span></p><p className="text-xs text-slate-500">{stat.label}</p></div></CardContent></Card>; })}
          </div>

          <section className="space-y-4" aria-labelledby="my-training-courses">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="my-training-courses" className="text-xl font-semibold">我的课程</h2><p className="mt-1 text-sm text-slate-500">主管安排与已开始学习的课程会集中显示在这里。</p></div><Link href="/team-os/training/records" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">查看全部学习记录</Link></div>
            {data.myCourses.length === 0 ? (
              <TrainingEmptyState title="还没有待学习课程" description="可以前往课程中心自主学习，或等待主管安排企业培训。" action={<Link href="/team-os/training/courses" className={actionLink}>浏览课程</Link>} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.myCourses.map((item) => (
                  <Card key={item.course.id}>
                    <CardHeader className="gap-3"><div className="flex flex-wrap items-start justify-between gap-3"><CardTitle className="max-w-xl break-words text-lg">{item.course.title}</CardTitle>{item.record ? <TrainingRecordBadge status={item.record.status} /> : item.assignment ? <TrainingAssignmentBadge status={item.assignment.status} overdue={item.assignment.overdue} /> : null}</div><CourseBadges category={item.course.category} level={item.course.level} status={item.course.status} /></CardHeader>
                    <CardContent className="space-y-4"><p className="text-sm leading-6 text-slate-600">{item.course.description}</p>{item.assignment ? <p className="text-xs text-slate-500">截止时间：{formatTrainingDate(item.assignment.deadline, true)} · {item.assignment.teamName}</p> : null}{item.latestEvaluation ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold text-slate-900">最近评分 {item.latestEvaluation.score} 分</span><p className="mt-1 line-clamp-2 leading-6 text-slate-600">{item.latestEvaluation.feedback}</p></div> : null}<div className="flex flex-wrap gap-3"><Link href={`/team-os/training/courses?courseId=${encodeURIComponent(item.course.id)}`} className={actionLink}>查看课程</Link>{item.course.status === "ACTIVE" && item.record?.status !== "COMPLETED" ? <Button size="sm" onClick={() => void handleStart(item.course.id)} disabled={startingId === item.course.id}><Play className="h-4 w-4" />{startingId === item.course.id ? "启动中…" : item.record ? "继续学习" : "开始学习"}</Button> : null}{item.course.status === "ACTIVE" ? <Link href={`/team-os/training/simulation?courseId=${encodeURIComponent(item.course.id)}`} className={actionLink}><Bot className="h-4 w-4" />模拟训练</Link> : null}</div></CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4" aria-labelledby="training-recommendations"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-indigo-700" /><h2 id="training-recommendations" className="text-xl font-semibold">推荐课程</h2></div><TrainingRecommendationPanel data={recommendations.data} loading={recommendations.loading} error={recommendations.error?.message} onRetry={() => void recommendations.reload()} /></section>
        </>
      )}
    </div>
  );
}
