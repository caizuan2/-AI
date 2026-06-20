import type { QuotaLimit, QuotaPolicy } from "@/types/quota";
import type { PlanType } from "@/types/subscription";

const planLabels: Record<PlanType, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise"
};

function formatLimit(value: QuotaLimit, suffix = "") {
  if (value === "unlimited") {
    return "不限";
  }

  return `${value.toLocaleString("zh-CN")}${suffix}`;
}

export function QuotaPolicyCards({ policies }: { policies: Record<string, QuotaPolicy> }) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {(["free", "pro", "enterprise"] as PlanType[]).map((plan) => {
        const policy = policies[plan];

        if (!policy) {
          return null;
        }

        return (
          <article key={plan} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-teal-700">{planLabels[plan]}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">套餐限额策略</h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {policy.plan}
              </span>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              {[
                ["每日 AI 请求", formatLimit(policy.dailyAiRequests, " 次")],
                ["每月 AI 请求", formatLimit(policy.monthlyAiRequests, " 次")],
                ["最大用户数", formatLimit(policy.maxUsers, " 人")],
                ["知识库文档上限", formatLimit(policy.maxKnowledgeDocuments, " 篇")],
                ["上传大小限制", formatLimit(policy.maxUploadSizeMB, " MB")]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-950">{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </section>
  );
}
