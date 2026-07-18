"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTaskForm } from "@/apps/team-os/features/tasks/components/CreateTaskForm";
import { TaskList } from "@/apps/team-os/features/tasks/components/TaskList";
import { TaskErrorState, TaskLoadingState } from "@/apps/team-os/features/tasks/components/TaskState";
import { useTasks } from "@/apps/team-os/features/tasks/hooks/useTasks";

export function TaskManagementPage() {
  const { data, loading, error, reload } = useTasks("management");
  const [creating, setCreating] = React.useState(false);

  async function handleCreated() {
    setCreating(false);
    await reload();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">AI 任务管理中心</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">任务管理</h1>
          <p className="mt-2 text-sm text-slate-600">主管发布团队目标，跟踪员工证据提交与完成进度。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/team-os/tasks/my"
            className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            我的任务
          </Link>
          <Button onClick={() => setCreating((value) => !value)} disabled={loading}>
            <Plus className="h-4 w-4" />创建任务
          </Button>
        </div>
      </div>

      {creating ? <CreateTaskForm teams={data.teams} onCreated={() => void handleCreated()} onCancel={() => setCreating(false)} /> : null}

      {loading ? <TaskLoadingState /> : error ? <TaskErrorState message={error} onRetry={() => void reload()} /> : <TaskList tasks={data.tasks} />}
    </div>
  );
}
