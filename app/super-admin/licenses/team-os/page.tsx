import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LicenseDashboard } from "@/components/super-admin/licenses/LicenseDashboard";

export const dynamic = "force-dynamic";

export default function SuperAdminTeamOsLicensesPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link href="/super-admin/licenses" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> 返回统一卡密中心
        </Link>
        <p className="mt-5 text-sm font-semibold text-indigo-700">AI Team OS License Management</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">Team OS 企业授权管理</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          本页面是超级管理员统一卡密中心的 Team OS 分类，仅签发 XT-TEAM 企业授权码；企业员工通过邀请加入，不单独购买卡密。
        </p>
      </section>
      <LicenseDashboard initialAppType="team_os" />
    </div>
  );
}
