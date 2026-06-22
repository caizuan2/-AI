import { AlertTriangle, Building2, Clock, Coins, Cpu, KeyRound, type LucideIcon } from "lucide-react";
import type { CommercialOverview, PlanDistribution } from "@/types/commercial";

type CardItem = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
};

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function totalTenants(plans: PlanDistribution) {
  return plans.free + plans.pro + plans.enterprise;
}

export function CommercialOverviewCards({ overview }: { overview: CommercialOverview }) {
  const cards: CardItem[] = [
    {
      label: "总企业数",
      value: formatNumber(overview.totals.tenants || totalTenants(overview.planDistribution)),
      hint: "所有套餐租户",
      icon: Building2,
      tone: "bg-slate-100 text-slate-700"
    },
    {
      label: "Pro 企业数",
      value: formatNumber(overview.planDistribution.pro),
      hint: "专业版客户",
      icon: Coins,
      tone: "bg-sky-50 text-sky-700"
    },
    {
      label: "Enterprise 企业数",
      value: formatNumber(overview.planDistribution.enterprise),
      hint: "企业版客户",
      icon: Building2,
      tone: "bg-emerald-50 text-emerald-700"
    },
    {
      label: "7天内到期",
      value: formatNumber(overview.expiring.within7Days),
      hint: "需要客户成功跟进",
      icon: Clock,
      tone: "bg-amber-50 text-amber-700"
    },
    {
      label: "今日 AI 调用",
      value: formatNumber(overview.totals.dailyAiRequests),
      hint: "按租户用量聚合",
      icon: Cpu,
      tone: "bg-violet-50 text-violet-700"
    },
    {
      label: "本月 Token 消耗",
      value: formatNumber(overview.totals.tokenUsage),
      hint: "模型成本估算基础",
      icon: Coins,
      tone: "bg-cyan-50 text-cyan-700"
    },
    {
      label: "卡密激活数量",
      value: formatNumber(overview.licenses.activated),
      hint: "license provider 当前激活",
      icon: KeyRound,
      tone: "bg-teal-50 text-teal-700"
    },
    {
      label: "Quota 告警数量",
      value: formatNumber(overview.totals.quotaWarnings),
      hint: "超限或接近超限租户",
      icon: AlertTriangle,
      tone: "bg-rose-50 text-rose-700"
    }
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-500">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{card.value}</p>
              </div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">{card.hint}</p>
          </article>
        );
      })}
    </section>
  );
}
