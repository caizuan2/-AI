import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommercialDashboard } from "@/components/super-admin/commercial/CommercialDashboard";

export default function SuperAdminCommercialPage() {
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
          <p className="text-sm font-semibold text-teal-700">Commercial Operations</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            商业化概览
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            汇总企业套餐、卡密激活、到期提醒、AI 用量和 Quota 告警。本阶段只做商业化运营 UI 接入，不接真实支付。
          </p>
        </div>
      </section>

      <CommercialDashboard />
    </div>
  );
}
