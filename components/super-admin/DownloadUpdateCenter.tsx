import Link from "next/link";
import { ArrowRight, Download, ExternalLink, ShieldAlert } from "lucide-react";
import { getDownloadPackages } from "@/lib/super-admin/services/download.service";
import type { DownloadPackage, DownloadStatus } from "@/types/super-admin";

const statusClasses: Record<DownloadStatus, string> = {
  待发布: "border-slate-200 bg-slate-50 text-slate-600",
  测试中: "border-sky-200 bg-sky-50 text-sky-700",
  正常: "border-emerald-200 bg-emerald-50 text-emerald-700",
  需更新: "border-amber-200 bg-amber-50 text-amber-700"
};

function DownloadTable({ items }: { items: DownloadPackage[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[980px] w-full bg-white text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">应用</th>
            <th className="px-4 py-3 font-semibold">平台</th>
            <th className="px-4 py-3 font-semibold">当前版本</th>
            <th className="px-4 py-3 font-semibold">最新版本</th>
            <th className="px-4 py-3 font-semibold">强制更新</th>
            <th className="px-4 py-3 font-semibold">发布时间</th>
            <th className="px-4 py-3 font-semibold">状态</th>
            <th className="px-4 py-3 font-semibold">下载地址</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="px-4 py-4">
                <p className="font-semibold text-slate-950">{item.appName}</p>
                <p className="mt-1 text-xs text-slate-500">{item.group} · {item.appType}</p>
                <p className="mt-2 max-w-[320px] text-xs leading-5 text-slate-500">{item.releaseNotes}</p>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-700">{item.platform}</td>
              <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-600">{item.currentVersion}</td>
              <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-950">{item.latestVersion}</td>
              <td className="whitespace-nowrap px-4 py-4">
                <span className={item.forceUpdate ? "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700" : "inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"}>
                  {item.forceUpdate ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
                  {item.forceUpdate ? "是" : "否"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{item.releasedAt}</td>
              <td className="whitespace-nowrap px-4 py-4">
                <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClasses[item.status]}`}>
                  {item.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                {item.downloadUrl.startsWith("/") ? (
                  <Link href={item.downloadUrl} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900">
                    打开
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="text-slate-500">{item.downloadUrl}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DownloadUpdateCenter({ mode = "full" }: { mode?: "compact" | "full" }) {
  const packages = getDownloadPackages();
  const items = mode === "compact" ? packages.slice(0, 5) : packages;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
            <Download className="h-4 w-4" />
            下载与更新中心
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">
            Web、APK、EXE 统一发布视图
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            当前仅展示 mock 数据和发布状态占位，不触发打包、不修改下载页、不连接真实发布接口。
          </p>
        </div>

        {mode === "compact" ? (
          <Link
            href="/super-admin/downloads"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            查看全部
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-5">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            暂无下载与更新数据
          </div>
        ) : (
          <DownloadTable items={items} />
        )}
      </div>
    </section>
  );
}
