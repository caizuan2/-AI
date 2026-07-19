"use client";

import { TrainingErrorState } from "@/apps/team-os/features/training/components/TrainingState";

export function TrainingRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <TrainingErrorState message="培训中心页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
