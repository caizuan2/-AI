"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { teamOsNavigation } from "@/apps/team-os/utils/navigation";

function isActive(pathname: string, href: string) {
  return href === "/team-os"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function TeamOsNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const items = mobile ? teamOsNavigation.filter((item) => "href" in item) : teamOsNavigation;

  return (
    <nav
      className={mobile
        ? "fixed inset-x-0 bottom-0 z-40 grid grid-cols-[repeat(7,minmax(0,1fr))] border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        : "mt-9 space-y-1"}
      aria-label={mobile ? "AI Team OS 移动导航" : "AI Team OS 主导航"}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const href = "href" in item ? item.href : null;
        const active = href ? isActive(pathname, href) : false;
        const className = mobile
          ? `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[11px] ${active ? "text-indigo-700" : "text-slate-500"}`
          : `flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-white/10 text-white" : href ? "text-slate-400 hover:bg-white/5 hover:text-white" : "cursor-not-allowed text-slate-600"}`;
        const content = (
          <>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className={mobile ? "max-w-full truncate" : undefined}>{item.label}</span>
          </>
        );

        return href ? (
          <Link key={item.label} href={href} className={className} aria-current={active ? "page" : undefined}>
            {content}
          </Link>
        ) : (
          <div key={item.label} className={className} aria-disabled="true" title="功能开发中">
            {content}
          </div>
        );
      })}
    </nav>
  );
}
