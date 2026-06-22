import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import { SyncHealthBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { DataSourceHealth } from "@/types/super-admin-system";

export function DataSourceHealthPanel({ health }: { health: DataSourceHealth }) {
  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-slate-950">系统健康与三端数据源状态</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Web、Android APK、Windows EXE 必须共用账号、后端、数据库和数据源；本页面只做超级管理员只读检查。
            </p>
          </div>
          <SyncHealthBadge health={health.persistenceStatus} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">最近同步时间</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{health.recentSyncAt}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">同步失败数量</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{health.failedSyncCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">孤立本地数据风险</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{health.isolatedLocalDataRisk ? "存在风险" : "无"}</p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        {health.platformStatuses.map((item) => (
          <article key={item.platform} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <DevicePlatformBadge platform={item.platform} />
              <SyncHealthBadge health={item.status} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-500">后端连通</dt>
                <dd className="font-semibold text-slate-950">{item.backendConnected ? "统一后端" : "未连通"}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-500">账号体系</dt>
                <dd className="font-semibold text-slate-950">{item.accountSystem}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-500">数据源</dt>
                <dd className="font-semibold text-slate-950">{item.dataSource}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {health.checks.map((check) => (
          <article key={check.name} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{check.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{check.description}</p>
              </div>
              <SyncHealthBadge health={check.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {check.requiredFor.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
