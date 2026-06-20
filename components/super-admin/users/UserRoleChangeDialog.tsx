"use client";

import { AlertTriangle } from "lucide-react";
import { UserRoleSelect } from "@/components/super-admin/users/UserRoleSelect";
import type {
  SuperAdminAssignableRole,
  SuperAdminRolePolicy,
  SuperAdminUserListItem
} from "@/types/super-admin-users";

type UserRoleChangeDialogProps = {
  user: SuperAdminUserListItem | null;
  roles: SuperAdminRolePolicy[];
  value: SuperAdminAssignableRole;
  reason: string;
  loading: boolean;
  error: string | null;
  onRoleChange: (role: SuperAdminAssignableRole) => void;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UserRoleChangeDialog({
  user,
  roles,
  value,
  reason,
  loading,
  error,
  onRoleChange,
  onReasonChange,
  onCancel,
  onConfirm
}: UserRoleChangeDialogProps) {
  if (!user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">确认修改用户角色</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              该角色变更会影响 Web / APK / EXE 三端登录权限，并写入审计日志。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-950">{user.name}</p>
          <p className="mt-1 text-slate-500">{user.phone}</p>
          <p className="mt-1 text-slate-500">当前角色：{user.roleLabel}</p>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">目标角色</span>
            <UserRoleSelect roles={roles} value={value} onChange={onRoleChange} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">调整原因</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="例如：企业管理员授权、投喂管理员授权、超级管理员交接"
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {loading ? "保存中" : "确认修改角色"}
          </button>
        </div>
      </section>
    </div>
  );
}
