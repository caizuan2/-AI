"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { CrossPlatformPersistencePanel } from "@/components/super-admin/system/CrossPlatformPersistencePanel";
import { DataSourceHealthPanel } from "@/components/super-admin/system/DataSourceHealthPanel";
import { SingleWindowSelfTestGuide } from "@/components/super-admin/system/SingleWindowSelfTestGuide";
import { fetchDataSourceStatus, type SuperAdminSystemClientResult } from "@/lib/super-admin/system-client";
import type { DataSourceHealth } from "@/types/super-admin-system";

export function SystemHealthDashboard() {
  const [result, setResult] = useState<SuperAdminSystemClientResult<DataSourceHealth> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchDataSourceStatus().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载系统健康与数据源状态" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data) {
    return <EmptyState message="暂无系统健康数据。" />;
  }

  return (
    <div className="space-y-6">
      <DataSourceHealthPanel health={result.data} />
      <CrossPlatformPersistencePanel health={result.data} />
      <SingleWindowSelfTestGuide />
    </div>
  );
}
