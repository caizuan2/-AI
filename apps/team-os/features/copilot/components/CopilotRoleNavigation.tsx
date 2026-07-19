import Link from "next/link";
import { Bot, BriefcaseBusiness, Building2, Lightbulb, UserRound } from "lucide-react";
import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";

const items = [
  { role: "EMPLOYEE_ASSISTANT" as const, href: "/team-os/copilot/employee", label: "员工助手", icon: UserRound },
  { role: "MANAGER_ASSISTANT" as const, href: "/team-os/copilot/manager", label: "主管助手", icon: BriefcaseBusiness },
  { role: "OWNER_ASSISTANT" as const, href: "/team-os/copilot/owner", label: "老板助手", icon: Building2 }
];

export function CopilotRoleNavigation({ currentRole, availableRoles }: {
  currentRole?: CopilotAssistantRole;
  availableRoles?: CopilotAssistantRole[];
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="企业助手角色导航">
      {items.map((item) => {
        const Icon = item.icon;
        const active = currentRole === item.role;
        const available = !availableRoles || availableRoles.includes(item.role);
        const className = `focus-ring inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${active ? "border-indigo-200 bg-indigo-50 text-indigo-800" : available ? "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"}`;
        const content = <><Icon className="h-4 w-4" aria-hidden="true" />{item.label}</>;
        if (!available) {
          return (
            <span key={item.role} aria-disabled="true" title="当前企业角色无权使用" className={className}>
              {content}
            </span>
          );
        }
        return (
          <Link
            key={item.role}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={className}
          >
            {content}
          </Link>
        );
      })}
      <Link href="/team-os/copilot/insights" className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        洞察中心
      </Link>
      <span className="ml-auto hidden items-center gap-2 text-xs text-slate-400 lg:inline-flex">
        <Bot className="h-4 w-4" aria-hidden="true" />
        服务端权限决定数据范围
      </span>
    </nav>
  );
}
