"use client";

import { Eye, Power, ShieldCheck } from "lucide-react";
import { UserRoleBadge } from "@/components/super-admin/users/UserRoleBadge";
import { UserStatusBadge } from "@/components/super-admin/users/UserStatusBadge";
import type { SuperAdminUserListItem } from "@/types/super-admin-users";

type UserTableProps = {
  users: SuperAdminUserListItem[];
  onView: (user: SuperAdminUserListItem) => void;
  onChangeRole: (user: SuperAdminUserListItem) => void;
  onToggleStatus: (user: SuperAdminUserListItem) => void;
};

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function UserTable({ users, onView, onChangeRole, onToggleStatus }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        暂无用户数据，或当前筛选条件没有匹配账号。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">用户</th>
            <th className="px-4 py-3 font-semibold">角色</th>
            <th className="px-4 py-3 font-semibold">企业 / 租户</th>
            <th className="px-4 py-3 font-semibold">卡密</th>
            <th className="px-4 py-3 font-semibold">最近登录</th>
            <th className="px-4 py-3 font-semibold">创建时间</th>
            <th className="px-4 py-3 font-semibold">账号状态</th>
            <th className="px-4 py-3 font-semibold">三端同步</th>
            <th className="px-4 py-3 font-semibold">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {users.map((user) => (
            <tr key={user.id} className="bg-white align-top">
              <td className="px-4 py-4">
                <p className="font-medium text-slate-950">{user.name}</p>
                <p className="mt-1 text-xs text-slate-500">{user.phone}</p>
                <p className="mt-1 max-w-[220px] truncate font-mono text-xs text-slate-400">{user.id}</p>
              </td>
              <td className="px-4 py-4">
                <UserRoleBadge role={user.role} label={user.roleLabel} />
              </td>
              <td className="px-4 py-4">
                <p className="text-slate-950">{user.tenantName}</p>
                <p className="mt-1 text-xs text-slate-500">{user.tenantPlan}</p>
              </td>
              <td className="px-4 py-4">
                <span className={user.licenseActivated ? "text-emerald-700" : "text-amber-700"}>
                  {user.licenseActivated ? "已激活" : "未激活"}
                </span>
              </td>
              <td className="px-4 py-4 text-slate-600">{formatDate(user.lastLoginAt)}</td>
              <td className="px-4 py-4 text-slate-600">{formatDate(user.createdAt)}</td>
              <td className="px-4 py-4">
                <UserStatusBadge status={user.accountStatus} label={user.accountStatusLabel} />
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1">
                  {user.syncedPlatforms.map((platform) => (
                    <span key={platform} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                      {platform}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onView(user)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    查看
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeRole(user)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    修改角色
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStatus(user)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {user.accountStatus === "active" ? "禁用" : "启用"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
