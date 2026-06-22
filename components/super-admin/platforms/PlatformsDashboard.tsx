"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { PlatformDownloadTable } from "@/components/super-admin/platforms/PlatformDownloadTable";
import { PlatformSyncPolicy } from "@/components/super-admin/platforms/PlatformSyncPolicy";
import { PlatformVersionCards } from "@/components/super-admin/platforms/PlatformVersionCards";
import {
  fetchPlatformDownloads,
  fetchPlatformVersions,
  type SuperAdminSyncClientResult
} from "@/lib/super-admin/sync-client";
import type { PlatformDownload, PlatformVersion } from "@/types/super-admin-sync";

type PlatformsState = {
  versions: PlatformVersion[];
  downloads: PlatformDownload[];
};

export function PlatformsDashboard() {
  const [result, setResult] = useState<SuperAdminSyncClientResult<PlatformsState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [versions, downloads] = await Promise.all([
        fetchPlatformVersions(),
        fetchPlatformDownloads()
      ]);
      const firstError = [versions, downloads].find((item) => !item.ok);

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

      if (!versions.data || !downloads.data) {
        setResult({
          ok: false,
          error: "平台版本数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          versions: versions.data,
          downloads: downloads.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载三端版本与发布状态" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data || result.data.versions.length === 0) {
    return <EmptyState message="暂无平台版本数据。" />;
  }

  return (
    <div className="space-y-6">
      <PlatformVersionCards versions={result.data.versions} />
      <PlatformSyncPolicy />
      <PlatformDownloadTable downloads={result.data.downloads} />
    </div>
  );
}
