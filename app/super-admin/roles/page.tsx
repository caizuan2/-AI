import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoleDescriptionCards } from "@/components/super-admin/roles/RoleDescriptionCards";
import { RolePermissionMatrix } from "@/components/super-admin/roles/RolePermissionMatrix";
import { getRolePolicyMatrix } from "@/lib/super-admin/services/role-policy.service";

export const dynamic = "force-dynamic";

export default function SuperAdminRolesPage() {
  const roles = getRolePolicyMatrix();

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回超级管理员看板
        </Link>
        <div className="mt-5">
          <p className="text-sm font-semibold text-teal-700">Role Permission Matrix</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            角色权限说明
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示普通用户、投喂管理员、企业管理员、超级管理员的边界。Worktree 3 负责全局角色授权，Worktree 1 / Worktree 2 只读取后端授权结果。
          </p>
        </div>
      </section>

      <RoleDescriptionCards roles={roles} />
      <RolePermissionMatrix roles={roles} />
    </div>
  );
}
