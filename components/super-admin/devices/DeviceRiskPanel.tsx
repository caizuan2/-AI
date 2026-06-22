import type { DeviceRisk } from "@/types/super-admin-sync";

const riskClasses = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

export function DeviceRiskPanel({ risks }: { risks: DeviceRisk[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">设备风险提示</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">只读展示异常设备，不执行真实强制下线或登录会话变更。</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          后续接入
        </span>
      </div>

      {risks.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          暂无设备风险
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {risks.map((risk) => (
            <article key={risk.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{risk.account}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{risk.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">{risk.deviceId} / {risk.detectedAt}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${riskClasses[risk.riskLevel]}`}>
                  {risk.riskLevel}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
