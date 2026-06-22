import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UsageDashboard } from "@/components/super-admin/usage/UsageDashboard";

export default function SuperAdminUsagePage() {
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
          <p className="text-sm font-semibold text-teal-700">Usage Analytics</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            使用量统计
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示 tenant、user 和 system 级使用量，以及 AI 请求、Token、知识库和上传次数排行。
          </p>
        </div>
      </section>

      <UsageDashboard />
    </div>
  );
}
