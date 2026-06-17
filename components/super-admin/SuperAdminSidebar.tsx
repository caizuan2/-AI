"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  Database,
  Download,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon
} from "lucide-react";
import { getSuperAdminMenus } from "@/lib/super-admin/services/dashboard.service";

const iconMap: Record<string, LucideIcon> = {
  Bot,
  Building2,
  Database,
  Download,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Settings,
  ShieldCheck,
  Users
};

function isActive(href: string, pathname: string) {
  if (href === "/super-admin") {
    return pathname === "/super-admin";
  }

  if (href.includes("#")) {
    return false;
  }

  return pathname.startsWith(href);
}

export function SuperAdminSidebar() {
  const pathname = usePathname();
  const superAdminMenus = getSuperAdminMenus();

  return (
    <aside className="min-w-0 overflow-hidden border-b border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
      <div className="flex h-full min-w-0 flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-400 text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">AI 知识库企业版</p>
              <p className="mt-1 truncate text-xs text-slate-400">Super Admin Console</p>
            </div>
          </div>
        </div>

        <nav className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto px-4 py-4 lg:block lg:space-y-1 lg:overflow-visible">
          {superAdminMenus.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const active = isActive(item.href, pathname);

            return (
              <Link
                key={item.title}
                href={item.href}
                className={[
                  "group flex min-w-[196px] items-start gap-3 rounded-lg px-3 py-3 text-sm transition lg:min-w-0",
                  active
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                ].join(" ")}
              >
                <Icon className={active ? "mt-0.5 h-4 w-4 text-teal-700" : "mt-0.5 h-4 w-4 text-slate-400 group-hover:text-teal-200"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    {item.badge ? (
                      <span className={active ? "rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600" : "rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300"}>
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={active ? "mt-1 block truncate text-xs text-slate-500" : "mt-1 block truncate text-xs text-slate-500 group-hover:text-slate-300"}>
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
