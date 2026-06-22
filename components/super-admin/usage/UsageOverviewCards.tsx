import { Activity, AlertTriangle, Building2, Cpu, type LucideIcon } from "lucide-react";
import type { SystemUsageOverview } from "@/types/commercial";

type UsageCard = {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
};

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

export function UsageOverviewCards({ overview }: { overview: SystemUsageOverview }) {
  const cards: UsageCard[] = [
    {
      label: "总企业数",
      value: overview.totalTenants,
      hint: "系统租户总量",
      icon: Building2
    },
    {
      label: "活跃企业",
      value: overview.activeTenants,
      hint: "当前可用租户",
      icon: Activity
    },
    {
      label: "AI 请求总量",
      value: overview.totalAIRequests,
      hint: "mock AI request 汇总",
      icon: Cpu
    },
    {
      label: "Token 消耗",
      value: overview.totalTokenUsage,
      hint: "模型调用成本基础",
      icon: Cpu
    },
    {
      label: "即将到期企业",
      value: overview.expiringTenants,
      hint: "30 天内到期",
      icon: AlertTriangle
    },
    {
      label: "异常企业",
      value: overview.abnormalTenants,
      hint: "存在错误请求",
      icon: AlertTriangle
    }
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">{formatNumber(card.value)}</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
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
