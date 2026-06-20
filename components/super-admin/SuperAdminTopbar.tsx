import { Bell, Crown, RadioTower, ShieldCheck } from "lucide-react";

export function SuperAdminTopbar() {
  return (
    <header className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
              <Crown className="h-3.5 w-3.5" />
              超级管理员
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <RadioTower className="h-3.5 w-3.5" />
              Enterprise Mock
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            AI 知识库企业管理中心
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            第一阶段 UI 骨架，集中展示企业级 SaaS 最高控制台的信息架构、指标、审计、下载与系统状态占位。
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">控制台版本</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">v0.1.0</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700">系统状态</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
              <ShieldCheck className="h-4 w-4" />
              稳定运行
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">通知中心</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-950">
              <Bell className="h-4 w-4 text-amber-600" />
              3 条待确认
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
