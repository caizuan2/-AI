import { Building2 } from "lucide-react";
import type { TrainingCompanyOption } from "@/apps/team-os/features/training/types";

export function TrainingCompanySelector({
  companyId,
  companyName,
  companies,
  disabled,
  onChange
}: {
  companyId: string;
  companyName: string;
  companies: TrainingCompanyOption[];
  disabled?: boolean;
  onChange: (companyId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-indigo-700">当前企业</p>
        <p className="truncate font-semibold text-slate-950">{companyName}</p>
      </div>
      {companies.length > 1 ? (
        <label className="text-xs font-medium text-slate-600">
          <span className="sr-only">切换企业</span>
          <select
            value={companyId}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="focus-ring h-10 min-w-44 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-60"
          >
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}
