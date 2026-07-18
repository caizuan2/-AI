"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/team-os/ai-coach", label: "AI 教练首页" },
  { href: "/team-os/ai-coach/analyze", label: "提交分析" },
  { href: "/team-os/ai-coach/team", label: "团队成长" }
];

export function AiCoachSectionNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="AI 教练导航">
      {items.map((item) => {
        const active = item.href === "/team-os/ai-coach"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
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
