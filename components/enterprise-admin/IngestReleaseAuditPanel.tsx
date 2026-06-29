"use client";

import type { ReleaseConsoleSummary } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

export function IngestReleaseAuditPanel({ data }: { data: ReleaseConsoleSummary }) {
  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202020]">发布记录审计</h2>
          <p className="mt-1 text-xs text-[#777]">第一阶段使用文件审计，不写数据库；写入失败时降级为内存记录。</p>
        </div>
        <ReleaseStatusBadge status={data.audit.length > 0 ? "success" : "unknown"} label={`${data.audit.length} records`} />
      </div>

      <div className="mt-4 space-y-2">
        {data.audit.length ? data.audit.map((record) => (
          <div key={record.id} className="grid gap-3 rounded-2xl bg-[#f8f8f7] px-4 py-3 text-xs text-[#666] md:grid-cols-[120px_1fr_110px]">
            <div>
              <p className="font-semibold text-[#202020]">{record.action}</p>
              <p className="mt-1">{record.environment}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate font-mono" title={record.ref ?? ""}>ref：{record.ref ?? "unknown"}</p>
              <p className="mt-1 truncate" title={record.reason ?? ""}>reason：{record.reason ?? "none"}</p>
              <p className="mt-1 truncate">actor：{record.actorName} / {record.actorRole}</p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <ReleaseStatusBadge status={record.status} />
              <p className="text-right text-[11px] text-[#999]">{record.createdAt}</p>
            </div>
          </div>
        )) : (
          <div className="rounded-2xl bg-[#f8f8f7] px-4 py-6 text-sm text-[#777]">
            暂无发布审计记录。触发发布、回滚或生成命令后会在这里显示。
          </div>
        )}
      </div>
    </section>
  );
}
