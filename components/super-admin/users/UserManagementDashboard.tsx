"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { LastSuperAdminGuard } from "@/components/super-admin/users/LastSuperAdminGuard";
import { UserAuditPreview } from "@/components/super-admin/users/UserAuditPreview";
import { UserPermissionSummary } from "@/components/super-admin/users/UserPermissionSummary";
import { UserRoleChangeDialog } from "@/components/super-admin/users/UserRoleChangeDialog";
import { UserTable } from "@/components/super-admin/users/UserTable";
import {
  fetchSuperAdminUsers,
  fetchSuperAdminUserDetail,
  updateSuperAdminUserRole,
  updateSuperAdminUserStatus,
  type SuperAdminUserClientResult
} from "@/lib/super-admin/user-admin-client";
import type {
  SuperAdminAssignableRole,
  SuperAdminUserDetail,
  SuperAdminUserListItem,
  SuperAdminUsersResponse
} from "@/types/super-admin-users";

function asAssignableRole(role: string): SuperAdminAssignableRole {
  if (role === "ingest_admin" || role === "enterprise_admin" || role === "super_admin") {
    return role;
  }

  return "user";
}

export function UserManagementDashboard() {
  const [result, setResult] = useState<SuperAdminUserClientResult<SuperAdminUsersResponse> | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [dialogUser, setDialogUser] = useState<SuperAdminUserListItem | null>(null);
  const [targetRole, setTargetRole] = useState<SuperAdminAssignableRole>("user");
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SuperAdminUserDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const query = useMemo(() => {
    const params = new URLSearchParams();

    if (search.trim()) {
      params.set("search", search.trim());
    }

    if (role) {
      params.set("role", role);
    }

    if (tenantId.trim()) {
      params.set("tenantId", tenantId.trim());
    }

    const text = params.toString();
    return text ? `?${text}` : "";
  }, [role, search, tenantId]);

  function loadUsers() {
    fetchSuperAdminUsers(query).then(setResult);
  }

  useEffect(() => {
    let mounted = true;

    fetchSuperAdminUsers(query).then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, [query]);

  function openRoleDialog(user: SuperAdminUserListItem) {
    setDialogUser(user);
    setTargetRole(asAssignableRole(user.role));
    setReason("");
    setDialogError(null);
    setStatusMessage(null);
  }

  function openDetail(user: SuperAdminUserListItem) {
    setDetail(null);
    setDetailError(null);

    startTransition(async () => {
      const response = await fetchSuperAdminUserDetail(user.id);

      if (!response.ok || !response.data) {
        setDetailError(response.error ?? "用户详情加载失败。");
        return;
      }

      setDetail(response.data);
    });
  }

  function confirmRoleChange() {
    if (!dialogUser) {
      return;
    }

    setDialogError(null);
    startTransition(async () => {
      const response = await updateSuperAdminUserRole(dialogUser.id, targetRole, reason.trim());

      if (!response.ok) {
        setDialogError(response.error ?? "角色修改失败。");
        return;
      }

      setDialogUser(null);
      setStatusMessage("角色修改成功，Web / APK / EXE 将读取同一后端角色。");
      loadUsers();
    });
  }

  function toggleStatus(user: SuperAdminUserListItem) {
    const nextActive = user.accountStatus !== "active";
    const actionLabel = nextActive ? "启用" : "禁用";
    const confirmed = window.confirm(`${actionLabel}账号会影响 Web / APK / EXE 三端登录权限，并写入审计日志。是否继续？`);

    if (!confirmed) {
      return;
    }

    setStatusMessage(null);
    startTransition(async () => {
      const response = await updateSuperAdminUserStatus(user.id, nextActive, `${actionLabel}账号`);

      if (!response.ok) {
        setStatusMessage(response.error ?? `${actionLabel}失败。`);
        return;
      }

      setStatusMessage(`${actionLabel}成功。`);
      loadUsers();
    });
  }

  if (!result) {
    return <LoadingState title="正在加载账号角色授权中心" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok) {
    return <ErrorState message={result.error} />;
  }

  if (!result.data) {
    return <EmptyState message="用户授权数据为空。" />;
  }

  return (
    <div className="space-y-6">
      <UserPermissionSummary />
      <LastSuperAdminGuard />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-slate-950">账号角色授权列表</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              共 {result.data.total.toLocaleString("zh-CN")} 个账号。角色、卡密和账号状态均来自统一后端。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm sm:w-64"
                placeholder="搜索手机号 / 昵称 / ID"
              />
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">全部角色</option>
              {result.data.roles.map((item) => (
                <option key={item.role} value={item.role}>{item.label}</option>
              ))}
              <option value="kb_admin">投喂管理员（旧角色）</option>
            </select>
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="租户 ID"
            />
          </div>
        </div>

        {statusMessage ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {statusMessage}
          </div>
        ) : null}
      </section>

      <UserTable
        users={result.data.users}
        onView={openDetail}
        onChangeRole={openRoleDialog}
        onToggleStatus={toggleStatus}
      />

      <UserAuditPreview />

      <UserRoleChangeDialog
        user={dialogUser}
        roles={result.data.roles}
        value={targetRole}
        reason={reason}
        loading={isPending}
        error={dialogError}
        onRoleChange={setTargetRole}
        onReasonChange={setReason}
        onCancel={() => setDialogUser(null)}
        onConfirm={confirmRoleChange}
      />

      {detail || detailError ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">用户详情</h2>
                <p className="mt-2 text-sm text-slate-500">角色授权记录与三端同步状态。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setDetailError(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            {detailError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {detailError}
              </div>
            ) : null}

            {detail ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="font-medium text-slate-950">{detail.name}</p>
                  <p className="mt-1 text-slate-500">{detail.phone}</p>
                  <p className="mt-1 text-slate-500">当前有效角色：{detail.roleLabel}</p>
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                  {detail.roleAssignments.length ? detail.roleAssignments.map((assignment) => (
                    <div key={assignment.id} className="grid gap-2 border-b border-slate-200 p-3 text-sm last:border-b-0 md:grid-cols-[1fr_1fr]">
                      <span className="font-medium text-slate-950">{assignment.role}</span>
                      <span className="text-slate-500">创建：{new Date(assignment.createdAt).toLocaleString("zh-CN")}</span>
                      <span className="text-slate-500">撤销：{assignment.revokedAt ? new Date(assignment.revokedAt).toLocaleString("zh-CN") : "未撤销"}</span>
                      <span className="text-slate-500">到期：{assignment.expiresAt ? new Date(assignment.expiresAt).toLocaleString("zh-CN") : "无"}</span>
                    </div>
                  )) : (
                    <div className="p-4 text-sm text-slate-500">暂无角色授权记录。</div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
