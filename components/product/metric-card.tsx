import type { ComponentType } from "react";

export function MetricCard({
  label,
  value,
  change,
  icon: Icon
}: {
  label: string;
  value: string;
  change?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted dark:text-slate-400">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-ink dark:text-slate-100">{value}</p>
        {change ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-200">{change}</span> : null}
      </div>
    </article>
  );
}
