"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BriefcaseBusiness,
  FileSignature,
  LayoutDashboard,
  Target,
  UsersRound
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/team-os/crm", label: "战情台", icon: LayoutDashboard, exact: true },
  { href: "/team-os/crm/leads", label: "线索", icon: Target },
  { href: "/team-os/crm/customers", label: "客户", icon: UsersRound },
  { href: "/team-os/crm/opportunities", label: "商机", icon: BriefcaseBusiness },
  { href: "/team-os/crm/contracts", label: "合同", icon: FileSignature },
  { href: "/team-os/crm/receivables", label: "回款", icon: Banknote }
] as const;

export function CrmSalesNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="CRM 销售闭环" className="overflow-x-auto rounded-xl border border-line bg-white p-2 shadow-sm">
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = "exact" in item && item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
