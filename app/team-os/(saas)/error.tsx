"use client";

import { TenantErrorState } from "@/apps/team-os/features/tenant/components/TenantState";

export default function TenantRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <TenantErrorState message="企业商业化平台页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
