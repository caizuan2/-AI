"use client";

import { IndustryCoachErrorState } from "@/apps/team-os/features/industry-coach/components/IndustryCoachState";

export function IndustryCoachRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl"><IndustryCoachErrorState message="行业教练页面加载失败，请重试。" onRetry={reset} /></div>;
}
