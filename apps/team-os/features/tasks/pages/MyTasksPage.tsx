"use client";

import Link from "next/link";
import { TaskList } from "@/apps/team-os/features/tasks/components/TaskList";
import { TaskErrorState, TaskLoadingState } from "@/apps/team-os/features/tasks/components/TaskState";
import { useTasks } from "@/apps/team-os/features/tasks/hooks/useTasks";

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function MyTasksPage() {
  const { data, loading, error, reload } = useTasks("my");
  const todayTasks = data.tasks.filter((task) => isToday(task.deadline));
  const otherTasks = data.tasks.filter((task) => !isToday(task.deadline));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">员工工作台</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">我的任务</h1>
          <p className="mt-2 text-sm text-slate-600">查看今日任务、完成进度并提交执行证据。</p>
        </div>
        <Link
          href="/team-os/tasks"
          className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
        >
          任务管理
        </Link>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">今日任务</h2>
        {loading ? <TaskLoadingState /> : error ? <TaskErrorState message={error} onRetry={() => void reload()} /> : <TaskList tasks={todayTasks} allowSubmit />}
      </div>

      {!loading && !error && otherTasks.length > 0 ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold">其他任务</h2>
          <TaskList tasks={otherTasks} allowSubmit />
        </div>
      ) : null}
    </div>
  );
}
