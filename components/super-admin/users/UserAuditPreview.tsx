"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { fetchSuperAdminUserAudit, type SuperAdminUserClientResult } from "@/lib/super-admin/user-admin-client";
import type { SuperAdminUserAuditResponse } from "@/types/super-admin-users";

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function UserAuditPreview() {
  const [result, setResult] = useState<SuperAdminUserClientResult<SuperAdminUserAuditResponse> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchSuperAdminUserAudit().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载角色变更审计" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data?.logs.length) {
    return <EmptyState message="暂无角色授权审计记录。" />;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">角色变更审计</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">展示最近 50 条角色授权与账号状态操作。</p>
      <div className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {result.data.logs.slice(0, 8).map((log) => (
          <div key={log.id} className="grid gap-2 p-4 text-sm md:grid-cols-[160px_minmax(0,1fr)_180px]">
            <span className="font-medium text-slate-950">{log.action}</span>
            <span className="min-w-0 truncate text-slate-600">
              操作人 {log.operatorUserId ?? "system"} 调整用户 {log.targetUserId ?? log.resourceId ?? "unknown"}
            </span>
            <span className="text-slate-500 md:text-right">{formatDate(log.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
