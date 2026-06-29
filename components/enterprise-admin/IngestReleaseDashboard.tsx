"use client";

import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { ReleaseConsoleSummary, ReleaseStatus } from "@/lib/enterprise/release-console-types";

export function ReleaseStatusBadge({ status, label }: { status: ReleaseStatus | boolean | null | undefined; label?: string }) {
  const normalized: ReleaseStatus = typeof status === "boolean"
    ? status ? "success" : "error"
    : status ?? "unknown";
  const tone = normalized === "success"
    ? "border-[#cbeeda] bg-[#f1fff6] text-[#128246]"
    : normalized === "warning"
      ? "border-[#ffe5b5] bg-[#fff9ec] text-[#9a6500]"
      : normalized === "error"
        ? "border-[#ffd4dc] bg-[#fff5f7] text-[#b93b4a]"
        : "border-[#e5e7eb] bg-[#f8fafc] text-[#6b7280]";
  const Icon = normalized === "success" ? CheckCircle2 : normalized === "error" ? XCircle : Clock3;

  return (
    <span className={["inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold", tone].join(" ")}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? normalized}
    </span>
  );
}

export function shortHash(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "unknown";
}

export function formatBytes(value: number | null | undefined) {
  if (!value) {
    return "unknown";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function MetricCard({ label, value, status }: { label: string; value: string; status?: ReleaseStatus | boolean | null }) {
  return (
    <div className="rounded-[22px] border border-[#ededeb] bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-[#8b8b86]">{label}</p>
        {status !== undefined ? <ReleaseStatusBadge status={status} /> : null}
      </div>
      <p className="mt-3 truncate text-xl font-semibold tracking-tight text-[#202020]" title={value}>{value}</p>
    </div>
  );
}

export function IngestReleaseDashboard({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="当前环境" value={data.environment} status={data.latestStatus} />
      <MetricCard label="Release HEAD" value={shortHash(data.releaseHead)} status={data.sync.webApkExeSync} />
      <MetricCard label="Release Tag" value={data.releaseTag ?? "unknown"} />
      <MetricCard label="BUILD_ID" value={data.buildId ?? "unknown"} />
      <MetricCard label="Web 版本" value={shortHash(data.web.head)} status={data.web.available} />
      <MetricCard label="PM2 状态" value="unknown" status="unknown" />
      <MetricCard label="SYSTEM_LINKED" value={data.systemLinked} status={data.systemLinked} />
      <MetricCard label="最近部署" value={data.deployedAt ?? "unknown"} status={data.latestStatus} />
    </section>
  );
}
