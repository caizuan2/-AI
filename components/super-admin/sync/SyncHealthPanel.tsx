import { SyncHealthBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { SyncOverview } from "@/types/super-admin-sync";

export function SyncHealthPanel({ overview }: { overview: SyncOverview }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">跨端一致性状态</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            设计目标是让超级管理员在 Web、Android APK、Windows EXE 看到同一账号、同一后端、同一数据库、同一数据源和同一套业务状态。
          </p>
        </div>
        <SyncHealthBadge health={overview.summary.consistencyStatus} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">同步健康</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{overview.summary.syncHealth}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">冲突数量</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{overview.summary.conflictCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">同步延迟</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{overview.summary.averageLatencyMs}ms</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        localStorage 只能作为临时 UI 缓存，不能作为三端同步的最终业务数据源；DATABASE_URL / DIRECT_URL 缺失会影响登录、注册、卡密激活、三端同步和数据保存。
      </div>
    </section>
  );
}
