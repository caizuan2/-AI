import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuotasDashboard } from "@/components/super-admin/quotas/QuotasDashboard";

export default function SuperAdminQuotasPage() {
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
          <p className="text-sm font-semibold text-teal-700">Quota Control</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Quota 限额
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示 free / pro / enterprise 套餐策略、当前使用量、剩余额度和是否超限。测试检查不影响真实业务。
          </p>
        </div>
      </section>

      <QuotasDashboard />
    </div>
  );
}
