import type { DataSourceHealth } from "@/types/super-admin-system";

export function CrossPlatformPersistencePanel({ health }: { health: DataSourceHealth }) {
  const rules = [
    "Web / Android APK / Windows EXE 必须共用同一个账号体系。",
    "三端必须共用同一个后端、同一个数据库、同一套业务状态。",
    "卡密 / 授权 / 到期、用户 / 企业 / 权限、聊天记录、附件和审计日志必须走统一数据源。",
    "localStorage 只能做临时 UI 缓存，不能作为三端同步的最终业务数据源。",
    "DATABASE_URL / DIRECT_URL 缺失时，登录、注册、卡密激活、三端同步和数据保存都会失败。"
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">三端持久化规则</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        当前只做 mock/API 预留，未来真实业务数据必须接入统一后端和数据库，不允许三端孤立保存。
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rules.map((rule) => (
          <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-700">
            {rule}
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        当前持久化状态：{health.persistenceStatus}；孤立本地数据风险：{health.isolatedLocalDataRisk ? "存在风险，需要配置统一数据库" : "无明显风险"}。
      </div>
    </section>
  );
}
