"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/team-os/notifications", label: "消息中心" },
  { href: "/team-os/notifications/settings", label: "通知设置" },
  { href: "/team-os/integrations", label: "企业连接" }
] as const;

export function NotificationSectionNavigation({ companyId }: { companyId?: string | null }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-2 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-2"
      aria-label="企业消息与连接导航"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const href = companyId && item.href !== "/team-os/integrations"
          ? `${item.href}?companyId=${encodeURIComponent(companyId)}`
          : item.href;

        return (
          <Link
            key={item.href}
            href={href}
            className={`focus-ring shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
