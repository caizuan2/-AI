"use client";

import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

export function IngestReleaseWorkflowPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202020]">GitHub Actions UI</h2>
          <p className="mt-1 text-xs text-[#777]">
            {data.github.available
              ? `读取仓库 ${data.github.repository} 的 workflow 最新运行状态。`
              : "GitHub Actions Token 未配置，当前仅显示本地 workflow 文件状态。"}
          </p>
        </div>
        <ReleaseStatusBadge status={data.github.available ? "success" : "warning"} label={data.github.available ? "GitHub API" : data.github.reason ?? "not configured"} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.workflows.map((workflow) => (
          <div key={workflow.file} className="rounded-2xl border border-[#f0f0ee] bg-[#fbfbfa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#202020]" title={workflow.name}>{workflow.name}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-[#777]" title={workflow.file}>{workflow.file}</p>
              </div>
              <ReleaseStatusBadge status={workflow.recentStatus} label={workflow.conclusion ?? (workflow.exists ? "exists" : "missing")} />
            </div>
            <div className="mt-3 space-y-1 text-xs leading-5 text-[#777]">
              <p>{workflow.triggerHint}</p>
              <p>run：<span className="font-mono">{workflow.runId ?? "unknown"}</span></p>
              <p>branch/tag：<span className="font-mono">{workflow.branch ?? workflow.tag ?? "unknown"}</span></p>
              <p>commit：<span className="font-mono">{workflow.commit?.slice(0, 8) ?? "unknown"}</span></p>
              <p>updated：{workflow.updatedAt ?? "unknown"}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {workflow.workflowUrl ? (
                <a
                  href={workflow.workflowUrl}
                  target="_blank"
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#128246] shadow-sm hover:bg-[#f0fbf3]"
                >
                  打开 Workflow
                </a>
              ) : null}
              {workflow.htmlUrl ? (
                <a
                  href={workflow.htmlUrl}
                  target="_blank"
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#555] shadow-sm hover:bg-[#efefed]"
                >
                  最近 Run
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
