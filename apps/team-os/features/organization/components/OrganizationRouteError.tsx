"use client";

import { OrganizationErrorState } from "@/apps/team-os/features/organization/components/OrganizationState";

export function OrganizationRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl"><OrganizationErrorState message="组织页面加载失败，请重试。" onRetry={reset} /></div>;
}
