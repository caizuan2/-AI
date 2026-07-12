"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AnalyticsPermissions } from "@/apps/team-os/features/analytics/types";

const ITEMS = [
  { href: "/team-os/analytics", label: "企业总览", allowed: () => true },
  { href: "/team-os/analytics/team", label: "团队分析", allowed: (permissions: AnalyticsPermissions) => permissions.canViewTeamAnalytics || permissions.canViewPersonalGrowth },
  { href: "/team-os/analytics/crm", label: "CRM 分析", allowed: (permissions: AnalyticsPermissions) => permissions.canViewCrmAnalytics },
  { href: "/team-os/analytics/training", label: "培训分析", allowed: (permissions: AnalyticsPermissions) => permissions.canViewTrainingAnalytics },
  { href: "/team-os/analytics/ai", label: "AI 分析", allowed: (permissions: AnalyticsPermissions) => permissions.canViewAiAnalytics }
] as const;

export function AnalyticsSectionNavigation({ permissions }: { permissions: AnalyticsPermissions }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => item.allowed(permissions));
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="AI 数据分析中心导航">
      {items.map((item) => {
        const active = item.href === "/team-os/analytics"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
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
