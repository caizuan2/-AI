import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SystemHealthDashboard } from "@/components/super-admin/system/SystemHealthDashboard";

export default function SuperAdminSystemHealthPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回超级管理员看板
        </Link>
        <div className="mt-5">
          <p className="text-sm font-semibold text-teal-700">System Health</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            系统健康与三端数据源状态
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示 Web、Android APK、Windows EXE 后端连通、统一账号、统一数据库、卡密授权、数据同步和持久化风险状态。
          </p>
        </div>
      </section>

      <SystemHealthDashboard />
    </div>
  );
}
