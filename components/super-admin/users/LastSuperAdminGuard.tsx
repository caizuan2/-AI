export function LastSuperAdminGuard() {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
      系统会在后端强制检查超级管理员数量，禁止降级或禁用最后一个 super_admin。该保护不依赖前端状态。
    </div>
  );
}
