"use client";

import { WorkflowErrorState } from "@/apps/team-os/features/workflow/components/WorkflowState";

export default function WorkflowRouteError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <WorkflowErrorState message="自动化工作流页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
