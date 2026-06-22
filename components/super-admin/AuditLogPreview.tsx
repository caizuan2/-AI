import { AlertTriangle, CheckCircle2, Clock, FileClock } from "lucide-react";
import { getRecentLogs } from "@/lib/super-admin/services/audit.service";
import type { SuperAdminStatus } from "@/types/super-admin";

const statusIcon = {
  critical: AlertTriangle,
  normal: CheckCircle2,
  pending: Clock,
  warning: AlertTriangle
};

const statusClasses: Record<SuperAdminStatus, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-100",
  normal: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  pending: "bg-slate-50 text-slate-600 ring-slate-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-100"
};

export function AuditLogPreview() {
  const auditLogPreview = getRecentLogs();

  return (
    <section id="audit" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <FileClock className="h-5 w-5 text-slate-700" />
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">安全审计日志预览</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        展示最近登录、知识库更新、异常日志和版本发布记录。本阶段仅为静态预览。
      </p>

      <div className="mt-5 space-y-3">
        {auditLogPreview.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            暂无审计日志
          </div>
        ) : (
          auditLogPreview.map((item) => {
            const Icon = statusIcon[item.status];

            return (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                        {item.category}
                      </span>
                      <p className="font-semibold text-slate-950">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                    <p className="mt-2 text-xs text-slate-500">操作人：{item.actor}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusClasses[item.status]}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {item.time}
                    </span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
