import type { OrganizationCompanyOption } from "@/apps/team-os/features/organization/types";

export function OrganizationCompanySelector({
  companyId,
  companyName,
  companies,
  disabled = false,
  onChange
}: {
  companyId: string | null;
  companyName: string | null;
  companies: OrganizationCompanyOption[];
  disabled?: boolean;
  onChange: (companyId: string) => void;
}) {
  if (companies.length > 1) {
    return (
      <label className="flex min-w-0 flex-col items-stretch gap-2 text-sm font-medium text-slate-600 sm:flex-row sm:items-center">
        当前企业
        <select
          value={companyId ?? ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="focus-ring h-10 min-w-0 w-full max-w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:max-w-72"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} · {company.id}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return companyName ? (
    <p className="text-sm text-slate-600">当前企业：<span className="font-semibold text-slate-900">{companyName}</span></p>
  ) : null;
}
