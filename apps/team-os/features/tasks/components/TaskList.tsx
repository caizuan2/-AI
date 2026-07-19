import Link from "next/link";
import { CalendarClock, ClipboardCheck, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatusBadge } from "@/apps/team-os/features/tasks/components/TaskStatusBadge";
import type { TaskListItem } from "@/apps/team-os/features/tasks/types";

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function TaskList({ tasks, allowSubmit = false }: { tasks: TaskListItem[]; allowSubmit?: boolean }) {
  if (tasks.length === 0) {
    return (
      <Card className="border-dashed border-slate-300">
        <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
          <ClipboardCheck className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="mt-4 font-medium text-slate-800">暂无任务</p>
          <p className="mt-1 text-sm text-slate-500">新任务发布后会显示在这里。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {tasks.map((task) => {
        const progress = Math.min(100, Math.round((task.completedCount / task.targetCount) * 100));
        const canSubmit = allowSubmit && task.status !== "COMPLETED" && task.status !== "CANCELLED" && new Date(task.deadline).getTime() > Date.now();

        return (
          <Card key={task.id} className="border-slate-200">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">{task.title}</CardTitle>
                  <CardDescription className="line-clamp-3 whitespace-pre-line">{task.description}</CardDescription>
                </div>
                <TaskStatusBadge status={task.status} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <UsersRound className="h-3.5 w-3.5" aria-hidden="true" /> {task.teamName}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {formatDeadline(task.deadline)} 截止
                </span>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>完成进度</span>
                  <span>{task.completedCount}/{task.targetCount}</span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`${task.title}完成进度`}
                  aria-valuemin={0}
                  aria-valuemax={task.targetCount}
                  aria-valuenow={Math.min(task.completedCount, task.targetCount)}
                >
                  <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {canSubmit ? (
                <div className="mt-5 flex justify-end">
                  <Link
                    href={`/team-os/tasks/${task.id}/submit`}
                    className="focus-ring inline-flex h-9 items-center justify-center rounded-lg bg-ink px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    提交任务
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
