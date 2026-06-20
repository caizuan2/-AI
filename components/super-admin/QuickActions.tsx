import Link from "next/link";
import {
  Bot,
  Building2,
  KeyRound,
  ShieldCheck,
  UploadCloud,
  Users,
  type LucideIcon
} from "lucide-react";
import { getQuickActions } from "@/lib/super-admin/services/analytics.service";
import type { SuperAdminStatus } from "@/types/super-admin";

const iconMap: Record<string, LucideIcon> = {
  Bot,
  Building2,
  KeyRound,
  ShieldCheck,
  UploadCloud,
  Users
};

const statusClasses: Record<SuperAdminStatus, string> = {
  critical: "bg-rose-100 text-rose-700",
  normal: "bg-emerald-100 text-emerald-700",
  pending: "bg-slate-100 text-slate-600",
  warning: "bg-amber-100 text-amber-700"
};

export function QuickActions() {
  const quickActions = getQuickActions();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">快捷操作入口</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        先提供最高控制台常用入口占位，后续可逐步接入真实权限与业务流程。
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {quickActions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            暂无快捷操作
          </div>
        ) : (
          quickActions.map((action) => {
            const Icon = iconMap[action.icon] ?? ShieldCheck;

            return (
              <Link
                key={action.title}
                href={action.href}
                className="group rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-200 hover:bg-teal-50"
              >
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${statusClasses[action.status]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-950 group-hover:text-teal-900">{action.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">{action.description}</span>
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
