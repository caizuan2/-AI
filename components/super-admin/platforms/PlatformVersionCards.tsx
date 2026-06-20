import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import type { PlatformVersion } from "@/types/super-admin-sync";

const releaseClasses = {
  stable: "border-emerald-200 bg-emerald-50 text-emerald-700",
  beta: "border-sky-200 bg-sky-50 text-sky-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  deprecated: "border-rose-200 bg-rose-50 text-rose-700"
};

export function PlatformVersionCards({ versions }: { versions: PlatformVersion[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {versions.map((item) => (
        <article key={item.platform} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DevicePlatformBadge platform={item.platform} />
              <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">{item.appName}</h2>
              <p className="mt-1 text-sm text-slate-500">{item.appType}</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <Download className="h-5 w-5" />
            </span>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["当前版本", item.currentVersion],
              ["最新版本", item.latestVersion],
              ["发布时间", item.releasedAt],
              ["数据源状态", item.dataSourceStatus]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${releaseClasses[item.releaseStatus]}`}>
              {item.releaseStatus}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {item.forceUpdate ? "强制更新" : "非强制更新"}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-500">{item.syncCapability}</p>

          <Link
            href="/super-admin/downloads"
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            下载中心联动
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      ))}
    </section>
  );
}
