export function PlatformSyncPolicy() {
  const policies = [
    "同一个 super_admin 账号体系",
    "同一套后端 API 与权限守卫",
    "同一套 SaaS Core / Billing / Quota 数据源",
    "Web、Android APK、Windows EXE 不保存孤立业务状态",
    "聊天记录、配置、卡密、附件、审计日志跨端一致"
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">三端同步策略</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        本阶段只做超级管理员端 mock/API 预留，为未来 APK / EXE / Web 同步落地提供结构。
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {policies.map((policy) => (
          <div key={policy} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-700">
            {policy}
          </div>
        ))}
      </div>
    </section>
  );
}
