"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { IngestReleaseActionsPanel } from "@/components/enterprise-admin/IngestReleaseActionsPanel";
import { IngestReleaseArtifactPanel } from "@/components/enterprise-admin/IngestReleaseArtifactPanel";
import { IngestReleaseAuditPanel } from "@/components/enterprise-admin/IngestReleaseAuditPanel";
import { IngestReleaseDashboard, ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";
import { IngestReleaseEnvironmentPanel } from "@/components/enterprise-admin/IngestReleaseEnvironmentPanel";
import { IngestReleaseHealthPanel } from "@/components/enterprise-admin/IngestReleaseHealthPanel";
import { IngestReleaseRollbackPanel } from "@/components/enterprise-admin/IngestReleaseRollbackPanel";
import { IngestReleaseWorkflowPanel } from "@/components/enterprise-admin/IngestReleaseWorkflowPanel";

export function IngestReleaseConsole({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ReleaseConsoleSummary | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/ingest-release/summary", {
        cache: "no-store",
        credentials: "include"
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? payload?.message ?? "读取发布控制台失败。");
      }

      setData(payload as ReleaseConsoleSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取发布控制台失败。");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  return (
    <main className="h-full overflow-y-auto bg-[#f7f7f6] px-5 py-6 text-[#191919]">
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#555] shadow-sm transition hover:bg-[#efefed]"
              aria-label="返回对话"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8b8b86]">Release Console</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#202020]">发布平台控制台</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#777]">统一管理 Web / APK / EXE 发布、GitHub Actions、版本清单、多环境、健康检查与回滚。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data ? <ReleaseStatusBadge status={data.permissions.canView} label={data.permissions.role} /> : null}
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[#555] shadow-sm transition hover:bg-[#efefed]"
            >
              <RefreshCw className={["h-4 w-4", isLoading ? "animate-spin" : ""].join(" ")} aria-hidden="true" />
              刷新
            </button>
          </div>
        </div>

        {isLoading ? (
          <ReleaseSkeleton />
        ) : error ? (
          <div className="rounded-[26px] border border-[#ffd4dc] bg-[#fff5f7] p-5 text-sm text-[#b93b4a] shadow-sm">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-5">
            <IngestReleaseDashboard data={data} />
            <IngestReleaseActionsPanel data={data} onActionComplete={() => void loadSummary()} />
            <IngestReleaseArtifactPanel data={data} />
            <div className="grid gap-5 xl:grid-cols-2">
              <IngestReleaseWorkflowPanel data={data} />
              <IngestReleaseEnvironmentPanel data={data} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <IngestReleaseHealthPanel data={data} />
              <IngestReleaseRollbackPanel data={data} />
            </div>
            <IngestReleaseAuditPanel data={data} />
            <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 text-xs leading-6 text-[#666] shadow-sm">
              <p className="font-semibold text-[#202020]">发布权限</p>
              <p className="mt-1">{data.permissions.note}</p>
            </section>
          </div>
        ) : (
          <div className="rounded-[26px] border border-[#ededeb] bg-white p-5 text-sm text-[#777] shadow-sm">
            暂无发布数据。
          </div>
        )}
      </div>
    </main>
  );
}

function ReleaseSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[22px] border border-[#ededeb] bg-white" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[26px] border border-[#ededeb] bg-white" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[26px] border border-[#ededeb] bg-white" />
        <div className="h-64 animate-pulse rounded-[26px] border border-[#ededeb] bg-white" />
      </div>
    </div>
  );
}
