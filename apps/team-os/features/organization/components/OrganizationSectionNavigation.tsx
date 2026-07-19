"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/team-os/organization", label: "组织管理" },
  { href: "/team-os/organization/members", label: "成员管理" },
  { href: "/team-os/organization/invitations", label: "邀请成员" }
];

export function OrganizationSectionNavigation({ canManageMembers = false, companyId }: { canManageMembers?: boolean; companyId?: string | null }) {
  const pathname = usePathname();
  const visibleItems = canManageMembers ? items : items.filter((item) => item.href !== "/team-os/organization/invitations");

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="组织管理导航">
      {visibleItems.map((item) => {
        const active = item.href === "/team-os/organization"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={companyId ? `${item.href}?companyId=${encodeURIComponent(companyId)}` : item.href}
            className={`focus-ring whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
