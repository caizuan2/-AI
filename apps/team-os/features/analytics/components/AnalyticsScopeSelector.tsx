import { Building2, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  AnalyticsCompanyOption,
  AnalyticsRangeDays,
  AnalyticsScopeMode
} from "@/apps/team-os/features/analytics/types";
import { ANALYTICS_RANGE_DAYS } from "@/apps/team-os/features/analytics/types";
import { analyticsScopeLabel } from "@/apps/team-os/features/analytics/utils/analytics-format";

export function AnalyticsScopeSelector({
  companyId,
  companyName,
  companies,
  scopeMode,
  days,
  disabled = false,
  onCompanyChange,
  onDaysChange
}: {
  companyId: string;
  companyName: string;
  companies: AnalyticsCompanyOption[];
  scopeMode: AnalyticsScopeMode;
  days: AnalyticsRangeDays;
  disabled?: boolean;
  onCompanyChange: (companyId: string) => void;
  onDaysChange: (days: AnalyticsRangeDays) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 lg:flex-row lg:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-indigo-700">当前分析范围</p>
          <Badge variant="outline" className="bg-white text-indigo-700 ring-indigo-100">{analyticsScopeLabel(scopeMode)}</Badge>
        </div>
        <p className="mt-1 truncate font-semibold text-slate-950">{companyName}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        {companies.length > 1 ? (
          <label className="min-w-0 text-xs font-medium text-slate-600">
            <span className="sr-only">切换企业</span>
            <select
              value={companyId}
              disabled={disabled}
              onChange={(event) => onCompanyChange(event.target.value)}
              className="focus-ring h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-60 sm:min-w-44"
            >
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">统计区间</span>
          <select
            value={days}
            disabled={disabled}
            onChange={(event) => onDaysChange(Number(event.target.value) as AnalyticsRangeDays)}
            className="focus-ring h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-60"
          >
            {ANALYTICS_RANGE_DAYS.map((rangeDays) => <option key={rangeDays} value={rangeDays}>近 {rangeDays} 天</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
