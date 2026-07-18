import { Building2, ShieldCheck, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { OrganizationOverview } from "@/apps/team-os/features/organization/types";

export function OrganizationSummary({ data, onCompanyChange }: { data: OrganizationOverview; onCompanyChange: (companyId: string) => void }) {
  const activeTeams = data.teams.filter((team) => team.status === "ACTIVE").length;
  const canShowMemberTotal = data.teams.every((team) => team.memberCount !== null);
  const members = data.teams.reduce((total, team) => total + (team.memberCount ?? 0), 0);
  const metrics = [
    { label: "团队数量", value: data.teams.length, icon: Building2 },
    ...(canShowMemberTotal ? [{ label: "成员数量", value: members, icon: UsersRound }] : []),
    { label: "启用团队", value: activeTeams, icon: ShieldCheck }
  ];

  return (
    <div className="space-y-4">
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-950 to-slate-900 text-white">
        <CardContent className="p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-300">当前企业</p>
          <h2 className="mt-2 text-2xl font-semibold">{data.companyName || "待建立企业"}</h2>
          <p className="mt-2 text-sm text-slate-300">企业标识：{data.companyId || "待分配"}</p>
          {data.companyIds.length > 1 ? (
            <select value={data.companyId || ""} onChange={(event) => onCompanyChange(event.target.value)} className="focus-ring mt-4 h-10 min-w-0 w-full max-w-full rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white sm:w-auto sm:max-w-96">
              {data.companies.map((company) => <option key={company.id} value={company.id} className="text-slate-900">{company.name} · {company.id}</option>)}
            </select>
          ) : null}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" /></span>
                <div><p className="text-2xl font-semibold">{metric.value}</p><p className="text-xs text-slate-500">{metric.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
