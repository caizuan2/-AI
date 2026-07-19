"use client";

import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import type { WorkflowContext } from "@/apps/team-os/features/workflow/types";

const permissionLabels: Record<WorkflowContext["permissionLevel"], string> = {
  OWNER: "企业负责人",
  MANAGER: "团队主管",
  TRAINER: "培训师",
  MEMBER: "普通成员"
};

export function WorkflowPageHeader({
  eyebrow,
  title,
  description,
  context,
  onCompanyChange,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  context?: WorkflowContext;
  onCompanyChange?: (companyId: string) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-medium text-indigo-700">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {context ? (
          <label className="min-w-56 space-y-1.5 text-xs font-medium text-slate-500">
            当前企业
            <span className="relative block">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <select
                value={context.companyId}
                onChange={(event) => onCompanyChange?.(event.target.value)}
                className="focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-800 shadow-sm"
                aria-label="切换当前企业"
              >
                {context.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </span>
            <span className="block font-normal text-slate-400">当前权限：{permissionLabels[context.permissionLevel]}</span>
          </label>
        ) : null}
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
