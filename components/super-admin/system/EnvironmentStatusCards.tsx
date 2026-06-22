import { AlertTriangle, CheckCircle2, Database, KeyRound, ServerCog } from "lucide-react";
import type { EnvConfigStatus } from "@/types/super-admin-system";

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span className={ready
      ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
      : "inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"}
    >
      {ready ? "已配置" : "未配置"}
    </span>
  );
}

export function EnvironmentStatusCards({ status }: { status: EnvConfigStatus }) {
  const cards = [
    {
      label: "DATABASE_URL",
      ready: status.databaseUrlConfigured,
      description: "登录、注册、卡密激活、三端同步和数据保存依赖统一数据库连接。",
      icon: Database
    },
    {
      label: "DIRECT_URL",
      ready: status.directUrlConfigured,
      description: "Prisma validate 和直连数据库检查依赖 DIRECT_URL；页面不会显示真实值。",
      icon: Database
    },
    {
      label: "SAAS_MODE",
      ready: true,
      description: `当前模式：${status.saasMode}。mock 可用于页面预览，prisma 用于未来真实数据源。`,
      icon: ServerCog
    },
    {
      label: "Billing Provider",
      ready: status.billingProvider === "license",
      description: "当前收费入口仍为 license，未接 Stripe / 支付宝 / 微信支付。",
      icon: KeyRound
    }
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{card.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4">
              <StatusPill ready={card.ready} />
            </div>
          </article>
        );
      })}

      <article className="sm:col-span-2 xl:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          {status.databaseUrlConfigured && status.directUrlConfigured ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          )}
          <div>
            <h2 className="text-base font-semibold text-slate-950">只读检查结果</h2>
            <div className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
              {status.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
