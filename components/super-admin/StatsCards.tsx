import {
  Activity,
  Bot,
  CalendarClock,
  Files,
  HeartPulse,
  KeyRound,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  TriangleAlert,
  Users,
  type LucideIcon
} from "lucide-react";
import { getDashboardStats } from "@/lib/super-admin/services/dashboard.service";
import type { DashboardStats, SuperAdminStatus, SuperAdminTone } from "@/types/super-admin";

const iconMap: Record<string, LucideIcon> = {
  Activity,
  Bot,
  CalendarClock,
  Files,
  HeartPulse,
  KeyRound,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  TriangleAlert,
  Users
};

const toneClasses: Record<SuperAdminTone, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200"
};

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

function StatCard({ stat }: { stat: DashboardStats }) {
  const Icon = iconMap[stat.icon] ?? Activity;

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500">{stat.title}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-normal text-slate-950">{stat.value}</span>
            {stat.unit ? <span className="text-sm text-slate-500">{stat.unit}</span> : null}
          </div>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${toneClasses[stat.tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses[stat.status]}`}>
          {statusLabels[stat.status]}
        </span>
        <span className="text-xs font-medium text-slate-600">{stat.trend}</span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{stat.description}</p>
    </article>
  );
}

export function StatsCards() {
  const superAdminStats = getDashboardStats();

  if (superAdminStats.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        暂无超级管理员看板数据
      </div>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {superAdminStats.map((stat) => (
        <StatCard key={stat.title} stat={stat} />
      ))}
    </section>
  );
}
