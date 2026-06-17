import Link from "next/link";
import { ArrowRight, BarChart3, Building2, Database, LockKeyhole, Settings } from "lucide-react";
import { AuditLogPreview } from "@/components/super-admin/AuditLogPreview";
import { DownloadUpdateCenter } from "@/components/super-admin/DownloadUpdateCenter";
import { HomeCommercialSnapshot } from "@/components/super-admin/commercial/HomeCommercialSnapshot";
import { QuickActions } from "@/components/super-admin/QuickActions";
import { StatsCards } from "@/components/super-admin/StatsCards";
import { HomeSyncSnapshot } from "@/components/super-admin/sync/HomeSyncSnapshot";
import { HomeEnvironmentSnapshot } from "@/components/super-admin/system/HomeEnvironmentSnapshot";
import { SystemHealthPanel } from "@/components/super-admin/SystemHealthPanel";
import { getLicenseSummary } from "@/lib/super-admin/services/license.service";

const centerPlaceholders = [
  {
    id: "enterprise",
    title: "企业组织 / 部门 / 角色",
    description: "企业、部门、角色矩阵和租户治理入口占位。",
    icon: Building2
  },
  {
    id: "users",
    title: "用户与权限中心",
    description: "账号状态、角色分配、访问策略与风险账号占位。",
    icon: LockKeyhole
  },
  {
    id: "knowledge",
    title: "知识库管理中心",
    description: "文档数量、审核、索引、分类、标签与质量治理占位。",
    icon: Database
  },
  {
    id: "models",
    title: "AI 模型配置中心",
    description: "模型供应商、额度、成本、降级策略与安全策略占位。",
    icon: Settings
  },
  {
    id: "operations",
    title: "运营管理中心",
    description: "公告、反馈、活动、客户成功动作与运营数据占位。",
    icon: BarChart3
  },
  {
    id: "settings",
    title: "系统设置中心",
    description: "企业级全局参数、环境标识、告警阈值与基础配置占位。",
    icon: Settings
  }
];

export default function SuperAdminPage() {
  const licenseSummary = getLicenseSummary();

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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AuditLogPreview />

        <section id="licenses" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">卡密 / 授权 / 到期管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            第一阶段仅展示授权管理入口占位，不修改现有卡密生成、验证、激活逻辑。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">已激活</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {licenseSummary.activated.toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">即将到期</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">{licenseSummary.expiringSoon}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">待配置策略</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{licenseSummary.pendingPolicies}</p>
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {centerPlaceholders.map((item) => {
          const Icon = item.icon;

          return (
            <article key={item.id} id={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold tracking-normal text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              <span className="mt-4 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                第一阶段占位
              </span>
            </article>
          );
        })}
      </section>
    </div>
  );
}
