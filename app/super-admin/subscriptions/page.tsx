import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SubscriptionsDashboard } from "@/components/super-admin/subscriptions/SubscriptionsDashboard";

export default function SuperAdminSubscriptionsPage() {
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
          <p className="text-sm font-semibold text-teal-700">Subscriptions</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            订阅与套餐
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示企业套餐、订阅状态、license 来源和到期情况。续费、升级和禁用按钮仅为后续接入占位。
          </p>
        </div>
      </section>

      <SubscriptionsDashboard />
    </div>
  );
}
