"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "培训首页", href: "/team-os/training" },
  { label: "课程中心", href: "/team-os/training/courses" },
  { label: "模拟训练", href: "/team-os/training/simulation" },
  { label: "学习记录", href: "/team-os/training/records" },
  { label: "培训管理", href: "/team-os/training/manage" }
] as const;

export function TrainingSectionNavigation() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="AI 培训中心导航">
      {items.map((item) => {
        const active = item.href === "/team-os/training"
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
