import { Activity, CheckCircle2, ServerCog, TriangleAlert } from "lucide-react";
import { getSystemHealth } from "@/lib/super-admin/services/system.service";
import type { SuperAdminStatus } from "@/types/super-admin";

const statusClasses: Record<SuperAdminStatus, string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-slate-200 bg-slate-50 text-slate-600",
  warning: "border-amber-200 bg-amber-50 text-amber-700"
};

const statusLabels: Record<SuperAdminStatus, string> = {
  critical: "异常",
  normal: "正常",
  pending: "待配置",
  warning: "警告"
};

const statusIcons = {
  critical: TriangleAlert,
  normal: CheckCircle2,
  pending: Activity,
  warning: TriangleAlert
};

export function SystemHealthPanel() {
  const systemHealthItems = getSystemHealth();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <ServerCog className="h-5 w-5 text-slate-700" />
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">系统健康状态</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        API、存储、AI 模型、同步通道与版本更新服务的占位状态。
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {systemHealthItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            暂无系统健康数据
          </div>
        ) : (
          systemHealthItems.map((item) => {
            const Icon = statusIcons[item.status];

            return (
              <article key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">检查时间：{item.checkedAt}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${statusClasses[item.status]}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {statusLabels[item.status]}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded bg-white px-3 py-2 ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">可用性</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{item.availability}</p>
                  </div>
                  <div className="rounded bg-white px-3 py-2 ring-1 ring-slate-200">
                    <p className="text-xs text-slate-500">延迟</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{item.latency}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{item.description}</p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
