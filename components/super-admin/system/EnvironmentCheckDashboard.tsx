"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { CrossPlatformPersistencePanel } from "@/components/super-admin/system/CrossPlatformPersistencePanel";
import { EnvironmentStatusCards } from "@/components/super-admin/system/EnvironmentStatusCards";
import { SingleWindowSelfTestGuide } from "@/components/super-admin/system/SingleWindowSelfTestGuide";
import {
  fetchDataSourceStatus,
  fetchEnvironmentCheck,
  type SuperAdminSystemClientResult
} from "@/lib/super-admin/system-client";
import type { DataSourceHealth, EnvConfigStatus } from "@/types/super-admin-system";

type EnvCheckState = {
  env: EnvConfigStatus;
  dataSource: DataSourceHealth;
};

export function EnvironmentCheckDashboard() {
  const [result, setResult] = useState<SuperAdminSystemClientResult<EnvCheckState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [env, dataSource] = await Promise.all([
        fetchEnvironmentCheck(),
        fetchDataSourceStatus()
      ]);
      const firstError = [env, dataSource].find((item) => !item.ok);

      if (!mounted) {
        return;
      }

      if (firstError) {
        setResult({
          ok: false,
          unauthorized: firstError.unauthorized,
          error: firstError.error
        });
        return;
      }

      if (!env.data || !dataSource.data) {
        setResult({
          ok: false,
          error: "环境连通性检查数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          env: env.data,
          dataSource: dataSource.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载环境连通性检查" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data) {
    return <EmptyState message="暂无环境检查数据。" />;
  }

  return (
    <div className="space-y-6">
      <EnvironmentStatusCards status={result.data.env} />
      <CrossPlatformPersistencePanel health={result.data.dataSource} />
      <SingleWindowSelfTestGuide />
    </div>
  );
}
