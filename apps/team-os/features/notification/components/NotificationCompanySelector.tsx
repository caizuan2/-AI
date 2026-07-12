import { Building2 } from "lucide-react";

export interface NotificationCompanyOption {
  id: string;
  name: string;
}

export function NotificationCompanySelector({
  companyId,
  companyName,
  companies,
  disabled = false,
  onChange
}: {
  companyId: string;
  companyName: string;
  companies: NotificationCompanyOption[];
  disabled?: boolean;
  onChange: (companyId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
        <Building2 className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-indigo-700">当前企业</p>
        <p className="mt-1 truncate font-semibold text-slate-950">{companyName}</p>
      </div>
      {companies.length > 1 ? (
        <label className="min-w-0 text-xs font-medium text-slate-600">
          <span className="sr-only">切换企业</span>
          <select
            value={companyId}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="focus-ring h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 disabled:cursor-wait disabled:opacity-60 sm:min-w-48"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
