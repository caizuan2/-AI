"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TaskSubmissionForm } from "@/apps/team-os/features/tasks/components/TaskSubmissionForm";
import { TaskErrorState, TaskLoadingState } from "@/apps/team-os/features/tasks/components/TaskState";
import { useTasks } from "@/apps/team-os/features/tasks/hooks/useTasks";

export function TaskSubmissionPage({ taskId }: { taskId: string }) {
  const { data, loading, error, reload } = useTasks("my");
  const task = data.tasks.find((item) => item.id === taskId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">员工工作台</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">任务提交</h1>
        </div>
        <Link
          href="/team-os/tasks/my"
          className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
        >
          返回我的任务
        </Link>
      </div>

      {loading ? <TaskLoadingState /> : error ? <TaskErrorState message={error} onRetry={() => void reload()} /> : task && task.status !== "COMPLETED" && task.status !== "CANCELLED" && new Date(task.deadline).getTime() > Date.now() ? (
        <TaskSubmissionForm task={task} />
      ) : (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center text-sm text-slate-500">任务不存在、已结束或当前账号无权访问。</CardContent>
        </Card>
      )}
    </div>
  );
}
