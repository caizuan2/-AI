"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, BookOpenCheck, CheckCircle2, ShieldAlert, UsersRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingAssignmentForm } from "@/apps/team-os/features/training/components/TrainingAssignmentForm";
import { TrainingCompanySelector } from "@/apps/team-os/features/training/components/TrainingCompanySelector";
import { TrainingProgressList } from "@/apps/team-os/features/training/components/TrainingProgressList";
import { TrainingSectionNavigation } from "@/apps/team-os/features/training/components/TrainingSectionNavigation";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import {
  formatTrainingDate,
  TrainingAssignmentBadge
} from "@/apps/team-os/features/training/components/TrainingBadges";
import { useTrainingManagement } from "@/apps/team-os/features/training/hooks/useTrainingManagement";

const linkButton = "focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50";

export function TrainingManagePage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [notice, setNotice] = React.useState<string | null>(null);
  const management = useTrainingManagement(companyId);
  const data = management.data;
  const forbidden = management.error?.code === "FORBIDDEN";

  async function handleAssigned(courseTitle: string, userName: string) {
    setNotice(`已为 ${userName} 安排“${courseTitle}”。`);
    await management.reload();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-700">Training Management</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">培训管理</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">安排员工课程，查看团队完成进度与训练效果。权限始终按当前企业和直接团队范围校验。</p></div><Link href="/team-os/training/courses" className={linkButton}>管理企业课程</Link></div>
      <TrainingSectionNavigation />

      {management.loading ? <TrainingLoadingState label="正在加载培训管理数据…" /> : forbidden ? (
        <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center"><ShieldAlert className="h-9 w-9 text-amber-600" /><p className="mt-4 font-semibold text-amber-900">当前角色没有培训管理权限</p><p className="mt-2 max-w-xl text-sm leading-6 text-amber-800">员工可以继续学习课程和参加 AI 模拟训练；企业负责人、主管或培训师可进入管理视图。</p><Link href="/team-os/training" className={`${linkButton} mt-5`}>返回培训首页</Link></CardContent></Card>
      ) : management.error && !data ? <TrainingErrorState message={management.error.message} onRetry={() => void management.reload()} /> : !data ? <TrainingEmptyState title="培训管理暂不可用" description="请确认当前账号具有有效团队管理权限。" /> : (
        <>
          <TrainingCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} disabled={management.loading} onChange={(nextCompanyId) => { setNotice(null); setCompanyId(nextCompanyId); }} />
          {notice ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{notice}</p> : null}
          {management.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{management.error.message}</p> : null}
          {data.truncated ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">当前企业培训数据超过展示上限，页面最多展示 200 门课程及最近 1000 条安排或学习记录。统计结果仅基于当前展示范围。</p> : null}

          <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-5"><UsersRound className="h-6 w-6 text-indigo-700" /><div><p className="text-2xl font-semibold">{data.progress.length}</p><p className="text-xs text-slate-500">可查看员工</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-5"><BookOpenCheck className="h-6 w-6 text-indigo-700" /><div><p className="text-2xl font-semibold">{data.assignments.filter((item) => item.status !== "CANCELLED").length}</p><p className="text-xs text-slate-500">有效培训安排</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-5"><BarChart3 className="h-6 w-6 text-indigo-700" /><div><p className="text-2xl font-semibold">{data.progress.reduce((sum, item) => sum + item.completed, 0)}</p><p className="text-xs text-slate-500">已完成课程</p></div></CardContent></Card></div>

          {data.context.permissions.canAssignTraining ? <TrainingAssignmentForm courses={data.courses} members={data.members} onCreated={(assignment) => handleAssigned(assignment.courseTitle, assignment.userName)} /> : null}

          <section className="space-y-4" aria-labelledby="training-progress"><div><h2 id="training-progress" className="text-xl font-semibold">员工培训进度</h2><p className="mt-1 text-sm text-slate-500">仅显示当前账号有权查看的团队成员。</p></div><TrainingProgressList progress={data.progress} /></section>

          <section className="space-y-4" aria-labelledby="training-assignments"><div><h2 id="training-assignments" className="text-xl font-semibold">培训安排</h2><p className="mt-1 text-sm text-slate-500">查看课程、执行团队、截止时间与完成状态。</p></div>{data.assignments.length === 0 ? <TrainingEmptyState title="暂无培训安排" description={data.context.permissions.canAssignTraining ? "使用上方表单为团队成员安排第一门课程。" : "当前团队还没有培训安排。"} /> : <div className="grid gap-4 lg:grid-cols-2">{data.assignments.map((assignment) => <Card key={assignment.id}><CardHeader className="gap-3"><div className="flex flex-wrap items-start justify-between gap-3"><CardTitle className="break-words text-base">{assignment.courseTitle}</CardTitle><TrainingAssignmentBadge status={assignment.status} overdue={assignment.overdue} /></div></CardHeader><CardContent className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><p><span className="text-xs text-slate-400">员工</span><span className="mt-1 block font-medium text-slate-900">{assignment.userName}</span></p><p><span className="text-xs text-slate-400">所属团队</span><span className="mt-1 block font-medium text-slate-900">{assignment.teamName}</span></p><p><span className="text-xs text-slate-400">截止时间</span><span className="mt-1 block">{formatTrainingDate(assignment.deadline, true)}</span></p><p><span className="text-xs text-slate-400">安排人</span><span className="mt-1 block">{assignment.assignedByName}</span></p></CardContent></Card>)}</div>}</section>
        </>
      )}
    </div>
  );
}
