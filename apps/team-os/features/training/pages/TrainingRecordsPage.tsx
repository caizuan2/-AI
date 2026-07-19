"use client";

import * as React from "react";
import Link from "next/link";
import { Award, Bot, CalendarDays, MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingCompanySelector } from "@/apps/team-os/features/training/components/TrainingCompanySelector";
import { TrainingSectionNavigation } from "@/apps/team-os/features/training/components/TrainingSectionNavigation";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import { formatTrainingDate, TrainingRecordBadge } from "@/apps/team-os/features/training/components/TrainingBadges";
import { useTrainingDashboard } from "@/apps/team-os/features/training/hooks/useTrainingDashboard";

const linkButton = "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50";

export function TrainingRecordsPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const dashboard = useTrainingDashboard(companyId);
  const data = dashboard.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-700">Learning History</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">学习记录</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">查看课程状态、历史最佳分和最近一次 AI 模拟训练反馈。</p></div><Link href="/team-os/training/simulation" className={linkButton}><Bot className="h-4 w-4" />继续模拟训练</Link></div>
      <TrainingSectionNavigation />
      {dashboard.loading ? <TrainingLoadingState label="正在加载学习记录…" /> : dashboard.error && !data ? <TrainingErrorState message={dashboard.error.message} onRetry={() => void dashboard.reload()} /> : !data ? <TrainingEmptyState title="学习记录暂不可用" description="请确认当前账号已加入有效企业团队。" /> : (
        <>
          <TrainingCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} disabled={dashboard.loading} onChange={setCompanyId} />
          {dashboard.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{dashboard.error.message}</p> : null}
          {data.truncated ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">学习记录超过展示上限，当前页面及统计仅包含最近 200 门课程。</p> : null}
          <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-xs text-slate-500">课程记录</p><p className="mt-1 text-2xl font-semibold">{data.records.length}<span className="ml-1 text-sm text-slate-500">门</span></p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-slate-500">已完成</p><p className="mt-1 text-2xl font-semibold">{data.stats.completedCourses}<span className="ml-1 text-sm text-slate-500">门</span></p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-slate-500">完成课程平均分</p><p className="mt-1 text-2xl font-semibold">{data.stats.completedCourses > 0 ? data.stats.averageScore : "—"}<span className="ml-1 text-sm text-slate-500">{data.stats.completedCourses > 0 ? "分" : ""}</span></p></CardContent></Card></div>
          {data.records.length === 0 ? <TrainingEmptyState title="尚无学习记录" description="从课程中心开始课程，或完成一次 AI 模拟训练后，成长记录会显示在这里。" action={<Link href="/team-os/training/courses" className={linkButton}>浏览课程</Link>} /> : (
            <div className="space-y-4">
              {data.records.map((record) => {
                const progress = data.myCourses.find((item) => item.course.id === record.courseId);
                const evaluation = progress?.latestEvaluation;
                return (
                  <Card key={record.id}>
                    <CardHeader className="gap-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="break-words text-lg">{progress?.course.title ?? "企业培训课程"}</CardTitle><p className="mt-1 flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />开始于 {formatTrainingDate(record.createdAt, true)}</p></div><TrainingRecordBadge status={record.status} /></div></CardHeader>
                    <CardContent className="space-y-4"><div className="flex flex-wrap items-center gap-5 rounded-xl bg-slate-50 p-4"><span className="flex items-center gap-2 text-sm text-slate-600"><Award className="h-4 w-4 text-indigo-700" />最佳分：<strong className="text-slate-950">{record.status === "STARTED" && !evaluation ? "尚未评分" : `${record.score} 分`}</strong></span>{record.completedAt ? <span className="text-xs text-slate-500">完成于 {formatTrainingDate(record.completedAt, true)}</span> : null}</div>{evaluation ? <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer list-none font-semibold text-slate-800"><span className="inline-flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-indigo-700" />最近一次 AI 训练：{evaluation.score} 分</span></summary><div className="mt-4 space-y-4 text-sm leading-7 text-slate-700"><div><p className="font-semibold text-slate-900">模拟问题</p><p className="mt-1 whitespace-pre-wrap break-words">{evaluation.question}</p></div><div><p className="font-semibold text-slate-900">我的回答</p><p className="mt-1 whitespace-pre-wrap break-words">{evaluation.answer}</p></div><div><p className="font-semibold text-slate-900">AI 反馈</p><p className="mt-1 whitespace-pre-wrap break-words">{evaluation.feedback}</p></div></div></details> : null}<div className="flex flex-wrap gap-3"><Link href={`/team-os/training/courses?courseId=${encodeURIComponent(record.courseId)}`} className={linkButton}>复习课程</Link><Link href={`/team-os/training/simulation?courseId=${encodeURIComponent(record.courseId)}`} className={linkButton}><Bot className="h-4 w-4" />再次训练</Link></div></CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
