import type { SuperAdminRolePolicy } from "@/types/super-admin-users";

export function RolePermissionMatrix({ roles }: { roles: SuperAdminRolePolicy[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">角色权限矩阵</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        角色授权结果来自统一后端，不以 Web / APK / EXE 本地缓存作为最终权限源。
      </p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">角色</th>
              <th className="px-4 py-3 font-semibold">核心权限</th>
              <th className="px-4 py-3 font-semibold">三端范围</th>
              <th className="px-4 py-3 font-semibold">Worktree 边界</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {roles.map((role) => (
              <tr key={role.role} className="align-top">
                <td className="px-4 py-4">
                  <p className="font-medium text-slate-950">{role.label}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{role.role}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.map((permission) => (
                      <span key={permission} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                        {permission}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="grid gap-1">
                    {role.platformScope.map((scope) => (
                      <span key={scope} className="text-slate-600">{scope}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-600">{role.worktreeBoundary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
