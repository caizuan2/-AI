import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import { SyncStatusBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { SyncEvent } from "@/types/super-admin-sync";

export function SyncEventList({ events }: { events: SyncEvent[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">最近同步事件</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">展示三端账号操作、同步对象、结果和耗时。</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">同步对象</th>
              <th className="px-4 py-3">结果</th>
              <th className="px-4 py-3">耗时</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{event.time}</td>
                <td className="px-4 py-3">
                  <DevicePlatformBadge platform={event.platform} />
                </td>
                <td className="px-4 py-3 text-slate-600">{event.account}</td>
                <td className="px-4 py-3 font-medium text-slate-950">{event.action}</td>
                <td className="px-4 py-3 text-slate-600">{event.scope}</td>
                <td className="px-4 py-3">
                  <SyncStatusBadge status={event.result} />
                </td>
                <td className="px-4 py-3 text-slate-600">{event.durationMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
