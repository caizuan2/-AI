"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BotMessageSquare, Database, Home, MessageSquarePlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/chat", label: "问答", icon: BotMessageSquare },
  { href: "/ingest", label: "投喂", icon: MessageSquarePlus },
  { href: "/knowledge", label: "知识", icon: Database },
  { href: "/settings", label: "设置", icon: Settings }
];

export function AppBottomNavigation({
  items = mobileNavItems
}: {
  items?: Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-950/95">
      <div className="grid grid-cols-5 gap-1">
        {items.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
                active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
