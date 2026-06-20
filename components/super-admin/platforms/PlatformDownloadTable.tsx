import Link from "next/link";
import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import type { PlatformDownload } from "@/types/super-admin-sync";

const updateClasses = {
  latest: "border-emerald-200 bg-emerald-50 text-emerald-700",
  available: "border-sky-200 bg-sky-50 text-sky-700",
  required: "border-rose-200 bg-rose-50 text-rose-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700"
};

export function PlatformDownloadTable({ downloads }: { downloads: PlatformDownload[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">下载与更新联动</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">只展示三端下载地址和更新状态，不实际构建 APK / EXE。</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[820px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">应用名称</th>
              <th className="px-4 py-3">版本</th>
              <th className="px-4 py-3">下载地址</th>
              <th className="px-4 py-3">更新状态</th>
              <th className="px-4 py-3">强制更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {downloads.map((item) => (
              <tr key={item.platform} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <DevicePlatformBadge platform={item.platform} />
                </td>
                <td className="px-4 py-3 font-medium text-slate-950">{item.appName}</td>
                <td className="px-4 py-3 text-slate-600">{item.version}</td>
                <td className="px-4 py-3">
                  <Link href="/super-admin/downloads" className="text-sm font-medium text-teal-700 hover:text-teal-900">
                    {item.downloadUrl}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${updateClasses[item.updateStatus]}`}>
                    {item.updateStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.forceUpdate ? "是" : "否"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
