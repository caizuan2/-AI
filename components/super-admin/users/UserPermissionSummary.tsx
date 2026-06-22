export function UserPermissionSummary() {
  const items = [
    ["统一后端", "Web / APK / EXE 读取同一套 User.role 与角色授权记录。"],
    ["投喂边界", "投喂管理员只负责知识库投喂，不管理用户私人会话。"],
    ["超级后台", "只有 super_admin 可以进入 /super-admin 并修改角色授权。"],
    ["账号状态", "User.isActive 已接入，禁用后现有登录守卫会阻止访问。"]
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map(([title, description]) => (
        <article key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </article>
      ))}
    </section>
  );
}
