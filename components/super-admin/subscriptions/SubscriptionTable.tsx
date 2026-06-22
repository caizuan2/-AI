import { SubscriptionStatusBadge } from "@/components/super-admin/subscriptions/SubscriptionStatusBadge";
import type { SubscriptionOverviewData } from "@/lib/super-admin/commercial-client";

type SubscriptionRow = SubscriptionOverviewData["items"][number];

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "未设置";
}

function getDaysUntilExpiry(days: number | null) {
  if (days === null) {
    return "未设置";
  }

  return days < 0 ? `已过期 ${Math.abs(days)} 天` : `${days} 天`;
}

export function SubscriptionTable({ items }: { items: SubscriptionRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">企业订阅与套餐</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          只读展示 license provider 解析出的套餐、订阅状态和到期信息，不修改卡密。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">企业名称</th>
              <th className="px-4 py-3">当前套餐</th>
              <th className="px-4 py-3">订阅状态</th>
              <th className="px-4 py-3">来源</th>
              <th className="px-4 py-3">开始时间</th>
              <th className="px-4 py-3">到期时间</th>
              <th className="px-4 py-3">绑定卡密</th>
              <th className="px-4 py-3">距离到期</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((item) => (
              <tr key={item.tenantId} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-950">{item.tenantName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {item.subscription.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <SubscriptionStatusBadge status={item.subscription.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{item.subscription.source}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(item.subscription.startedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(item.subscription.expiresAt)}</td>
                <td className="px-4 py-3 text-slate-600">{item.subscription.licenseId ? "已绑定" : "未绑定"}</td>
                <td className="px-4 py-3 text-slate-600">{getDaysUntilExpiry(item.subscriptionDaysUntilExpiry)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {["续费", "升级", "禁用"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        disabled
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 disabled:cursor-not-allowed"
                      >
                        {label} 后续接入
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
