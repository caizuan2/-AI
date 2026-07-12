import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalyticsMetricUnit } from "@/apps/team-os/features/analytics/types";
import { formatAnalyticsNumber } from "@/apps/team-os/features/analytics/utils/analytics-format";

const ACCENTS = {
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  rose: "bg-rose-50 text-rose-700"
} as const;

export function AnalyticsMetricCard({
  label,
  value,
  unit = "COUNT",
  available = true,
  description,
  sampleSize,
  icon: Icon,
  accent = "indigo"
}: {
  label: string;
  value: number | null;
  unit?: AnalyticsMetricUnit;
  available?: boolean;
  description?: string;
  sampleSize?: number;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
}) {
  const displayValue = available ? formatAnalyticsNumber(value, unit) : "暂无采集";
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ACCENTS[accent]}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-slate-950">{displayValue}</p>
          </div>
        </div>
        <div className="mt-auto space-y-1 text-xs leading-5 text-slate-500">
          {description ? <p>{description}</p> : null}
          {typeof sampleSize === "number" ? <p>样本量：{sampleSize}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
