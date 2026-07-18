import { BrainCircuit, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CopilotAccessContext } from "@/apps/team-os/features/copilot/types";

const scopeLabels = { SELF: "仅本人", TEAM: "直属团队", COMPANY: "当前企业" } as const;

export function CopilotPageHeader({
  eyebrow,
  title,
  description,
  context,
  refreshing,
  onCompanyChange,
  onRefresh
}: {
  eyebrow: string;
  title: string;
  description: string;
  context?: CopilotAccessContext;
  refreshing?: boolean;
  onCompanyChange?: (companyId: string) => void;
  onRefresh?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-violet-50 p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
          <BrainCircuit className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>
            {context ? <Badge variant="outline" className="bg-white text-indigo-700">{scopeLabels[context.scopeMode]}</Badge> : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          {context && context.companies.length > 1 && onCompanyChange ? (
            <label className="text-xs font-medium text-slate-600">
              <span className="sr-only">切换企业</span>
              <select value={context.companyId} onChange={(event) => onCompanyChange(event.target.value)} className="focus-ring h-10 min-w-44 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">
                {context.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
          ) : null}
          {onRefresh ? (
            <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              刷新数据
            </Button>
          ) : null}
        </div>
      </div>
      {context ? <p className="mt-5 text-xs text-slate-500">当前企业：<span className="font-semibold text-slate-700">{context.companyName}</span> · 数据不会跨企业合并</p> : null}
    </div>
  );
}
