"use client";

import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

export function IngestReleaseWorkflowPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#202020]">CI/CD Workflow 状态</h2>
      <p className="mt-1 text-xs text-[#777]">本轮不接 GitHub API，基于仓库 workflow 文件做可视化。</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.workflows.map((workflow) => (
          <div key={workflow.file} className="rounded-2xl border border-[#f0f0ee] bg-[#fbfbfa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#202020]" title={workflow.name}>{workflow.name}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-[#777]" title={workflow.file}>{workflow.file}</p>
              </div>
              <ReleaseStatusBadge status={workflow.exists ? "success" : "error"} label={workflow.exists ? "exists" : "missing"} />
            </div>
            <p className="mt-3 text-xs leading-5 text-[#777]">{workflow.triggerHint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
