import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserManagementDashboard } from "@/components/super-admin/users/UserManagementDashboard";

export const dynamic = "force-dynamic";

export default function SuperAdminUsersPage() {
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
          <p className="text-sm font-semibold text-teal-700">Account & Role Authorization</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            账号 / 角色授权管理中心
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            管理用户角色、账号状态和三端权限同步。角色结果来自统一后端，Web、Android APK、Windows EXE 不保存孤立权限。
          </p>
        </div>
      </section>

      <UserManagementDashboard />
    </div>
  );
}
