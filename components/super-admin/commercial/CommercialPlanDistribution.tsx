import type { PlanDistribution } from "@/types/commercial";

const planMeta = {
  free: {
    label: "Free",
    description: "试用和轻量客户",
    bar: "bg-slate-500"
  },
  pro: {
    label: "Pro",
    description: "标准商业订阅",
    bar: "bg-sky-500"
  },
  enterprise: {
    label: "Enterprise",
    description: "企业级付费客户",
    bar: "bg-emerald-500"
  }
};

export function CommercialPlanDistribution({ plans }: { plans: PlanDistribution }) {
  const total = Math.max(plans.free + plans.pro + plans.enterprise, 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">企业套餐分布</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">基于卡密授权解析出的 free / pro / enterprise 分布。</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          License Provider
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {(["free", "pro", "enterprise"] as const).map((plan) => {
          const percent = Math.round((plans[plan] / total) * 100);
          const meta = planMeta[plan];

          return (
            <div key={plan}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{meta.description}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900">{plans[plan].toLocaleString("zh-CN")} 家</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full ${meta.bar}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
