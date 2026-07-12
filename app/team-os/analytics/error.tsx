"use client";

import { AnalyticsErrorState } from "@/apps/team-os/features/analytics/components/AnalyticsState";

export default function AnalyticsRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl"><AnalyticsErrorState message="数据分析中心页面加载失败，请重试。" onRetry={reset} /></div>;
}
