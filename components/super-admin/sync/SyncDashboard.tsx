"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { SyncEventList } from "@/components/super-admin/sync/SyncEventList";
import { SyncHealthPanel } from "@/components/super-admin/sync/SyncHealthPanel";
import { SyncMatrix } from "@/components/super-admin/sync/SyncMatrix";
import { SyncOverviewCards } from "@/components/super-admin/sync/SyncOverviewCards";
import {
  fetchSyncEvents,
  fetchSyncOverview,
  type SuperAdminSyncClientResult
} from "@/lib/super-admin/sync-client";
import type { SyncEvent, SyncOverview } from "@/types/super-admin-sync";

type SyncDashboardState = {
  overview: SyncOverview;
  events: SyncEvent[];
};

export function SyncDashboard() {
  const [result, setResult] = useState<SuperAdminSyncClientResult<SyncDashboardState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [overview, events] = await Promise.all([
        fetchSyncOverview(),
        fetchSyncEvents()
      ]);
      const firstError = [overview, events].find((item) => !item.ok);

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

      if (!overview.data || !events.data) {
        setResult({
          ok: false,
          error: "三端同步数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          overview: overview.data,
          events: events.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载三端同步控制中心" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data) {
    return <EmptyState message="暂无三端同步数据。" />;
  }

  return (
    <div className="space-y-6">
      <SyncOverviewCards overview={result.data.overview} />
      <SyncHealthPanel overview={result.data.overview} />
      <SyncMatrix rows={result.data.overview.matrix} />
      <SyncEventList events={result.data.events} />
    </div>
  );
}
