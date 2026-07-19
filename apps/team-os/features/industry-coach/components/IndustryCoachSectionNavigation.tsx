"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/team-os/industry-coach", label: "行业教练首页" },
  { href: "/team-os/industry-coach/standards", label: "行业标准库" },
  { href: "/team-os/industry-coach/rules", label: "评分规则库" }
];

export function IndustryCoachSectionNavigation({ companyId }: { companyId?: string | null }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="行业教练导航">
      {items.map((item) => {
        const active = item.href === "/team-os/industry-coach"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const href = companyId ? `${item.href}?companyId=${encodeURIComponent(companyId)}` : item.href;

        return (
          <Link
            key={item.href}
            href={href}
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
