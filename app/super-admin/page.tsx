import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuditLogPreview } from "@/components/super-admin/AuditLogPreview";
import { DownloadUpdateCenter } from "@/components/super-admin/DownloadUpdateCenter";
import { HomeCommercialSnapshot } from "@/components/super-admin/commercial/HomeCommercialSnapshot";
import { QuickActions } from "@/components/super-admin/QuickActions";
import { StatsCards } from "@/components/super-admin/StatsCards";
import { HomeSyncSnapshot } from "@/components/super-admin/sync/HomeSyncSnapshot";
import { HomeEnvironmentSnapshot } from "@/components/super-admin/system/HomeEnvironmentSnapshot";
import { SystemHealthPanel } from "@/components/super-admin/SystemHealthPanel";

export default function SuperAdminPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">Enterprise Command Center</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              超级管理员总览看板
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              面向企业级 SaaS 的最高控制台骨架。本阶段只使用静态 mock 数据展示菜单结构、核心指标、下载更新、审计日志和系统健康状态。
            </p>
          </div>
          <Link
            href="/super-admin/downloads"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            进入下载与更新中心
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <StatsCards />

      <HomeCommercialSnapshot />

      <HomeSyncSnapshot />

      <HomeEnvironmentSnapshot />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-normal text-slate-950">数据统计与看板</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                图表区域暂用静态占位，后续可接入真实统计 API。
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              Mock Chart
            </span>
          </div>
          <div className="mt-6 h-72 rounded-lg border border-dashed border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4">
            <div className="flex h-full items-end gap-2">
              {[36, 58, 44, 70, 52, 82, 63, 90, 76, 68, 94, 88].map((height, index) => (
                <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-slate-900/80"
                    style={{ height: `${height}%` }}
                  />
                  <span className="hidden text-[10px] text-slate-500 sm:inline">{index + 1}月</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <QuickActions />
      </section>

      <SystemHealthPanel />

      <DownloadUpdateCenter mode="compact" />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <AuditLogPreview />
      </section>
    </div>
  );
}
