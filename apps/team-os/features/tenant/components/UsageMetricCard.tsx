import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ACCENTS = {
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700"
} as const;

export function UsageMetricCard({
  label,
  displayValue,
  available,
  unavailableLabel = "暂无采集",
  definition,
  usagePercent,
  limitLabel,
  icon: Icon,
  accent = "indigo"
}: {
  label: string;
  displayValue: string;
  available: boolean;
  unavailableLabel?: string;
  definition: string;
  usagePercent?: number | null;
  limitLabel?: string | null;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
}) {
  const normalizedPercent = typeof usagePercent === "number"
    ? Math.min(100, Math.max(0, usagePercent))
    : null;

  return (
    <Card>
      <CardContent className="flex h-full min-w-0 flex-col gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ACCENTS[accent]}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-slate-950">
              {available ? displayValue : unavailableLabel}
            </p>
          </div>
        </div>
        {available && normalizedPercent !== null ? (
          <div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={`${label}使用比例`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercent)}
            >
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${normalizedPercent}%` }} />
            </div>
            {limitLabel ? <p className="mt-2 text-xs text-slate-500">{limitLabel}</p> : null}
          </div>
        ) : null}
        <p className="mt-auto text-xs leading-5 text-slate-500">{definition}</p>
      </CardContent>
    </Card>
  );
}
