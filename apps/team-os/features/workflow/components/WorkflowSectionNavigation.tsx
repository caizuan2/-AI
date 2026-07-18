"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowContext } from "@/apps/team-os/features/workflow/types";

export function WorkflowSectionNavigation({ context }: { context: WorkflowContext }) {
  const pathname = usePathname();
  const query = `?companyId=${encodeURIComponent(context.companyId)}`;
  const items = [
    { href: "/team-os/workflow", label: "工作流列表", visible: true },
    { href: "/team-os/workflow/create", label: "创建流程", visible: context.canCreate },
    { href: "/team-os/workflow/executions", label: "执行记录", visible: true }
  ].filter((item) => item.visible);

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="AI 工作流中心导航">
      {items.map((item) => {
        const active = item.href === "/team-os/workflow"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={`${item.href}${query}`}
            className={`focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
