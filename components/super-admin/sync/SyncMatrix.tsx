import { SyncStatusBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { SyncMatrixRow } from "@/types/super-admin-sync";

export function SyncMatrix({ rows }: { rows: SyncMatrixRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">三端同步矩阵</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Web、Android APK、Windows EXE 使用同一账号体系、同一后端和同一数据源，不保存孤立本地业务状态。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[760px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">同步对象</th>
              <th className="px-4 py-3">Web</th>
              <th className="px-4 py-3">Android APK</th>
              <th className="px-4 py-3">Windows EXE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={`${row.scope}-${row.label}`} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-950">{row.label}</td>
                <td className="px-4 py-3">
                  <SyncStatusBadge status={row.web} />
                </td>
                <td className="px-4 py-3">
                  <SyncStatusBadge status={row.android_apk} />
                </td>
                <td className="px-4 py-3">
                  <SyncStatusBadge status={row.windows_exe} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
