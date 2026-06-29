"use client";

import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

function statusToTone(status: number | "error" | "unknown") {
  if (status === "unknown") return "unknown";
  if (status === "error") return "error";
  if (status >= 200 && status < 400) return "success";
  if (status === 401 || status === 403 || status === 404) return "warning";
  return "error";
}

export function IngestReleaseHealthPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#202020]">健康检查</h2>
      <div className="mt-4 space-y-2">
        {data.health.map((target) => (
          <div key={target.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f8f8f7] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#202020]">{target.key}</p>
              <p className="mt-0.5 font-mono text-xs text-[#777]">{target.path}</p>
            </div>
            <ReleaseStatusBadge status={statusToTone(target.status)} label={String(target.status)} />
          </div>
        ))}
      </div>
    </section>
  );
}
