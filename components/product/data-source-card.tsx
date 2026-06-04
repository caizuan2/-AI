import { CheckCircle2, Clock, PlugZap } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusMap = {
  connected: {
    label: "已连接",
    icon: CheckCircle2,
    className: "text-emerald-700 dark:text-emerald-200"
  },
  syncing: {
    label: "同步中",
    icon: Clock,
    className: "text-amber-700 dark:text-amber-200"
  },
  available: {
    label: "未连接",
    icon: PlugZap,
    className: "text-slate-500 dark:text-slate-400"
  }
};

export function DataSourceCard({
  name,
  description,
  status,
  lastSync,
  icon: Icon
}: {
  name: string;
  description: string;
  status: keyof typeof statusMap;
  lastSync: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const config = statusMap[status];
  const StatusIcon = config.icon;

  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
          <Icon className="h-5 w-5" />
        </span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", config.className)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {config.label}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink dark:text-slate-100">{name}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted dark:text-slate-400">{description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted dark:text-slate-400">最后同步：{lastSync}</span>
        <Button size="sm" variant={status === "available" ? "default" : "outline"}>
          {status === "available" ? "连接" : "管理"}
        </Button>
      </div>
    </article>
  );
}
