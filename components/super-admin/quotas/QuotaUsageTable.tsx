import type { CommercialTenantSummary } from "@/types/commercial";
import type { QuotaLimit } from "@/types/quota";

function formatLimit(value?: QuotaLimit) {
  if (value === undefined) {
    return "未计算";
  }

  if (value === "unlimited") {
    return "不限";
  }

  return value.toLocaleString("zh-CN");
}

function statusClass(allowed: boolean) {
  return allowed
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

export function QuotaUsageTable({ items }: { items: CommercialTenantSummary[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">企业 Quota 当前用量</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">展示 AI 请求、用户数、知识库文档和上传次数，所有数据仍来自 mock 服务层。</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[960px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">企业</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">今日 AI</th>
              <th className="px-4 py-3">本月 AI</th>
              <th className="px-4 py-3">用户数</th>
              <th className="px-4 py-3">知识文档</th>
              <th className="px-4 py-3">上传次数</th>
              <th className="px-4 py-3">剩余额度</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((item) => (
              <tr key={item.tenantId} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-950">{item.tenantName}</td>
                <td className="px-4 py-3 text-slate-600">{item.plan}</td>
                <td className="px-4 py-3 text-slate-600">{item.usage.dailyAiRequests.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-slate-600">{item.usage.monthlyAiRequests.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-slate-600">{item.usage.userCount.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-slate-600">{item.usage.knowledgeDocuments.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-slate-600">{item.usage.uploadCount.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-slate-600">{formatLimit(item.quota.remaining)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(item.quota.allowed)}`}>
                    {item.quota.allowed ? "未超限" : "已超限"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
