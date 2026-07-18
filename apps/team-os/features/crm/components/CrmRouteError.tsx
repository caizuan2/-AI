"use client";

import { CrmErrorState } from "@/apps/team-os/features/crm/components/CrmState";

export function CrmRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl"><CrmErrorState message="CRM 页面加载失败，请重试。" onRetry={reset} /></div>;
}
