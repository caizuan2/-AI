"use client";

import type { ReleaseArtifact, ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { formatBytes, ReleaseStatusBadge, shortHash } from "@/components/enterprise-admin/IngestReleaseDashboard";

function ArtifactRow({ artifact }: { artifact: ReleaseArtifact }) {
  return (
    <tr className="border-t border-[#f0f0ee]">
      <td className="px-3 py-3 font-semibold text-[#202020]">{artifact.platform}</td>
      <td className="px-3 py-3"><ReleaseStatusBadge status={artifact.available} label={artifact.available ? "available" : "blocked"} /></td>
      <td className="px-3 py-3 font-mono text-xs text-[#555]">{shortHash(artifact.head)}</td>
      <td className="max-w-[220px] truncate px-3 py-3 text-[#555]" title={artifact.path ?? artifact.url ?? ""}>{artifact.path ?? artifact.url ?? "暂无产物"}</td>
      <td className="px-3 py-3 text-[#555]">{formatBytes(artifact.size)}</td>
      <td className="max-w-[160px] truncate px-3 py-3 font-mono text-xs text-[#555]" title={artifact.sha256 ?? ""}>{artifact.sha256 ?? "unknown"}</td>
      <td className="px-3 py-3 text-[#777]">{artifact.buildTime ?? "unknown"}</td>
      <td className="px-3 py-3 text-[#9a6500]">{artifact.reason ?? "-"}</td>
    </tr>
  );
}

export function IngestReleaseArtifactPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202020]">三端同步状态 / 构建产物</h2>
          <p className="mt-1 text-xs text-[#777]">不伪造 APK / EXE 成功；阻断时显示真实 reason。</p>
        </div>
        <ReleaseStatusBadge status={data.sync.webApkExeSync} label={data.sync.webApkExeSync ? "WEB_APK_EXE_SYNC true" : "WEB_APK_EXE_SYNC false"} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SyncBox label="Release" value={shortHash(data.sync.releaseHead)} />
        <SyncBox label="Web一致" value={data.sync.webMatches ? "yes" : "no"} status={data.sync.webMatches} />
        <SyncBox label="APK一致" value={data.sync.apkMatches === null ? "blocked" : data.sync.apkMatches ? "yes" : "no"} status={data.sync.apkMatches ?? "warning"} />
        <SyncBox label="EXE一致" value={data.sync.exeMatches === null ? "blocked" : data.sync.exeMatches ? "yes" : "no"} status={data.sync.exeMatches ?? "warning"} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-[#8b8b86]">
            <tr>
              <th className="px-3 py-2">platform</th>
              <th className="px-3 py-2">available</th>
              <th className="px-3 py-2">commit</th>
              <th className="px-3 py-2">path / url</th>
              <th className="px-3 py-2">size</th>
              <th className="px-3 py-2">sha256</th>
              <th className="px-3 py-2">buildTime</th>
              <th className="px-3 py-2">reason</th>
            </tr>
          </thead>
          <tbody>
            <ArtifactRow artifact={data.web} />
            <ArtifactRow artifact={data.apk} />
            <ArtifactRow artifact={data.exe} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SyncBox({ label, value, status }: { label: string; value: string; status?: boolean | "warning" }) {
  return (
    <div className="rounded-2xl bg-[#f8f8f7] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#777]">{label}</p>
        {status !== undefined ? <ReleaseStatusBadge status={status === "warning" ? "warning" : status} /> : null}
      </div>
      <p className="mt-2 font-mono text-sm font-semibold text-[#202020]">{value}</p>
    </div>
  );
}
