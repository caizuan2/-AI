"use client";

import { TaskErrorState } from "@/apps/team-os/features/tasks/components/TaskState";

export function TaskRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <TaskErrorState message="任务页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
