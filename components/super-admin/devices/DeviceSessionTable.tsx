import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import { SyncStatusBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { DeviceRiskLevel, DeviceSession } from "@/types/super-admin-sync";

const riskClasses: Record<DeviceRiskLevel, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

export function DeviceSessionTable({ sessions }: { sessions: DeviceSession[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">当前登录设备</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          展示 Web / Android APK / Windows EXE 会话状态。操作按钮仅为占位，不修改登录核心。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">设备名称</th>
              <th className="px-4 py-3">IP / 位置</th>
              <th className="px-4 py-3">登录时间</th>
              <th className="px-4 py-3">最后活跃</th>
              <th className="px-4 py-3">同步状态</th>
              <th className="px-4 py-3">风险</th>
              <th className="px-4 py-3">会话</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sessions.map((session) => (
              <tr key={session.deviceId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <DevicePlatformBadge platform={session.platform} />
                </td>
                <td className="px-4 py-3 text-slate-600">{session.account}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{session.deviceName}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{session.appVersion}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{session.ip} / {session.location}</td>
                <td className="px-4 py-3 text-slate-600">{session.loginAt}</td>
                <td className="px-4 py-3 text-slate-600">{session.lastActiveAt}</td>
                <td className="px-4 py-3">
                  <SyncStatusBadge status={session.syncStatus} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${riskClasses[session.riskLevel]}`}>
                    {session.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{session.sessionStatus}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {["查看详情", "标记异常", "强制下线"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        disabled
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 disabled:cursor-not-allowed"
                      >
                        {label} 后续接入
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
