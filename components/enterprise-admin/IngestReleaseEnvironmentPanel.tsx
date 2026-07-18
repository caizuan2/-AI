"use client";

import ExternalLink from "next/link";
import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge, shortHash } from "@/components/enterprise-admin/IngestReleaseDashboard";

export function IngestReleaseEnvironmentPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#202020]">多环境管理</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {data.environments.map((environment) => (
          <div key={environment.key} className="rounded-2xl bg-[#f8f8f7] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#202020]">{environment.label}</p>
              <ReleaseStatusBadge status={environment.apiHealth} />
            </div>
            <p className="mt-3 text-xs text-[#777]">HEAD：<span className="font-mono">{shortHash(environment.currentHead)}</span></p>
            <p className="mt-1 text-xs text-[#777]">Tag：<span className="font-mono">{environment.releaseTag ?? data.releaseTag ?? "unknown"}</span></p>
            <p className="mt-1 text-xs text-[#777]">SYSTEM_LINKED：{environment.systemLinked ?? "unknown"}</p>
            <p className="mt-1 text-xs text-[#777]">部署：{environment.deployStatus}</p>
            <p className="mt-1 text-xs text-[#777]">时间：{environment.lastDeployTime ?? "unknown"}</p>
            {environment.webUrl ? (
              <ExternalLink href={environment.webUrl} target="_blank" className="mt-3 inline-flex text-xs font-semibold text-[#128246] hover:underline">
                打开 Web URL
              </ExternalLink>
            ) : (
              <p className="mt-3 text-xs font-semibold text-[#999]">Web URL 未配置</p>
            )}
            {environment.note ? <p className="mt-2 text-xs text-[#999]">{environment.note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
