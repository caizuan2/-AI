"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { DeviceRiskPanel } from "@/components/super-admin/devices/DeviceRiskPanel";
import { DeviceSessionTable } from "@/components/super-admin/devices/DeviceSessionTable";
import {
  fetchDeviceRisks,
  fetchDeviceSessions,
  type SuperAdminSyncClientResult
} from "@/lib/super-admin/sync-client";
import type { DeviceRisk, DeviceSession } from "@/types/super-admin-sync";

type DevicesState = {
  sessions: DeviceSession[];
  risks: DeviceRisk[];
};

export function DevicesDashboard() {
  const [result, setResult] = useState<SuperAdminSyncClientResult<DevicesState> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [sessions, risks] = await Promise.all([
        fetchDeviceSessions(),
        fetchDeviceRisks()
      ]);
      const firstError = [sessions, risks].find((item) => !item.ok);

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

      if (!sessions.data || !risks.data) {
        setResult({
          ok: false,
          error: "设备会话数据为空"
        });
        return;
      }

      setResult({
        ok: true,
        data: {
          sessions: sessions.data,
          risks: risks.data
        }
      });
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载设备会话管理" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data || result.data.sessions.length === 0) {
    return <EmptyState message="暂无设备会话数据。" />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">当前登录设备</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.sessions.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">活跃会话</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {result.data.sessions.filter((item) => item.sessionStatus === "active").length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">风险设备</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{result.data.risks.length}</p>
        </div>
      </section>

      <DeviceRiskPanel risks={result.data.risks} />
      <DeviceSessionTable sessions={result.data.sessions} />
    </div>
  );
}
