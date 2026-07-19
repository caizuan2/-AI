"use client";

import { CopilotErrorState } from "@/apps/team-os/features/copilot/components/CopilotState";

export default function CopilotRouteError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <CopilotErrorState message="企业 Copilot 页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
