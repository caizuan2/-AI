"use client";

import { AiCoachErrorState } from "@/apps/team-os/features/ai-coach/components/AiCoachState";

export function AiCoachRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl"><AiCoachErrorState message="AI 教练页面加载失败，请重试。" onRetry={reset} /></div>;
}
