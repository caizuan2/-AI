import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LicenseDashboard } from "@/components/super-admin/licenses/LicenseDashboard";

export const dynamic = "force-dynamic";

export default function SuperAdminLicensesPage() {
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
          <p className="text-sm font-semibold text-teal-700">License Authorization Center</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            卡密 / 授权 / 到期管理
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            统一管理用户端、投喂管理员端与 AI Team OS 企业授权。超级管理员历史卡密只保留后端兼容，不再开放生成。
          </p>
        </div>
      </section>

      <LicenseDashboard />
    </div>
  );
}
