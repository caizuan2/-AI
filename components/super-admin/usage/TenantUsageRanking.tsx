import type { CommercialTenantSummary } from "@/types/commercial";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function sortBy(items: CommercialTenantSummary[], score: (item: CommercialTenantSummary) => number) {
  return [...items].sort((a, b) => score(b) - score(a));
}

export function TenantUsageRanking({ items }: { items: CommercialTenantSummary[] }) {
  const rows = sortBy(items, (item) => item.usage.monthlyAiRequests);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">租户使用量排行</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          汇总 tenant 级、user 级和 system 级用量视角，当前仍为 mock 数据。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">企业</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">AI 请求排行</th>
              <th className="px-4 py-3">Token 消耗排行</th>
              <th className="px-4 py-3">知识库数量排行</th>
              <th className="px-4 py-3">上传次数排行</th>
              <th className="px-4 py-3">用户数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((item, index) => (
              <tr key={item.tenantId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{item.tenantName}</div>
                  <div className="mt-0.5 text-xs text-slate-500">#{index + 1}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.plan}</td>
                <td className="px-4 py-3 text-slate-600">{formatNumber(item.usage.monthlyAiRequests)}</td>
                <td className="px-4 py-3 text-slate-600">{formatNumber(item.usage.tokenUsage)}</td>
                <td className="px-4 py-3 text-slate-600">{formatNumber(item.usage.knowledgeDocuments)}</td>
                <td className="px-4 py-3 text-slate-600">{formatNumber(item.usage.uploadCount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatNumber(item.usage.userCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
