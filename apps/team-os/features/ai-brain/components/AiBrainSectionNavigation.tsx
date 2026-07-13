"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrainCircuit, Lightbulb, ListChecks } from "lucide-react";
import type { AiBrainContext } from "@/apps/team-os/features/ai-brain/types";

const items = [
  { href: "/team-os/ai-brain", label: "AI Brain 首页", icon: BrainCircuit, exact: true },
  { href: "/team-os/ai-brain/candidates", label: "候选知识", icon: ListChecks, exact: false },
  { href: "/team-os/ai-brain/optimization", label: "优化中心", icon: Lightbulb, exact: false }
] as const;

export function AiBrainSectionNavigation({ context }: { context: AiBrainContext }) {
  const pathname = usePathname();
  const visible = context.permissionLevel === "OWNER"
    ? items
    : context.canViewAnalysis
      ? items.filter((item) => item.href !== "/team-os/ai-brain/optimization")
      : items.slice(0, 1);
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="AI Brain 页面导航">
      {visible.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={`${item.href}?companyId=${encodeURIComponent(context.companyId)}`}
            className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />{item.label}
          </Link>
        );
      })}
    </nav>
  );
}
