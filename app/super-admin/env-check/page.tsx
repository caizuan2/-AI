import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EnvironmentCheckDashboard } from "@/components/super-admin/system/EnvironmentCheckDashboard";

export default function SuperAdminEnvCheckPage() {
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
          <p className="text-sm font-semibold text-teal-700">Environment Check</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            环境连通性检查
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            只读检查 DATABASE_URL、DIRECT_URL、SAAS_MODE、Billing Provider 和三端统一数据源要求。页面不会显示真实连接串或密钥。
          </p>
        </div>
      </section>

      <EnvironmentCheckDashboard />
    </div>
  );
}
