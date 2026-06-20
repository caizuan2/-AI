import type { ExpiringSubscription } from "@/types/subscription";

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "未设置";
}

function getTone(days: number) {
  if (days < 0) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (days <= 7) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function CommercialExpiringList({ items }: { items: ExpiringSubscription[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">到期提醒</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">展示 30 天内到期或已过期的 license 订阅。</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          只读提醒
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          暂无 30 天内到期企业
        </div>
      ) : (
        <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {items.map((item) => (
            <div key={`${item.tenantId}-${item.licenseId ?? "license"}`} className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.tenantId}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.plan} / {item.source} / 到期日 {formatDate(item.expiresAt)}
                </p>
              </div>
              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${getTone(item.daysUntilExpiry)}`}>
                {item.daysUntilExpiry < 0 ? `已过期 ${Math.abs(item.daysUntilExpiry)} 天` : `${item.daysUntilExpiry} 天后到期`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
