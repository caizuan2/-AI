import Link from "next/link";
import { ArrowLeft, CalendarDays, CircleUserRound, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerLevelBadge, CustomerStageBadge } from "@/apps/team-os/features/crm/components/CrmBadges";
import { formatCrmDate } from "@/apps/team-os/features/crm/components/crm-ui";
import type { CustomerRecord } from "@/apps/team-os/features/crm/types";

export function CustomerDetailHeader({ customer, backHref }: { customer: CustomerRecord; backHref: string }) {
  return (
    <div className="space-y-5">
      <Link href={backHref} className="focus-ring inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" aria-hidden="true" />返回客户列表</Link>
      <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-6 text-white shadow-xl shadow-indigo-100 sm:p-8">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2"><CustomerStageBadge stage={customer.stage} /><CustomerLevelBadge level={customer.level} /></div>
            <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{customer.name}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-indigo-200">
              <span className="inline-flex max-w-full min-w-0 items-center gap-2 break-words [overflow-wrap:anywhere]"><CircleUserRound className="h-4 w-4 shrink-0" aria-hidden="true" />负责人：{customer.ownerName}</span>
              <span className="inline-flex max-w-full min-w-0 items-center gap-2 break-words [overflow-wrap:anywhere]"><UsersRound className="h-4 w-4 shrink-0" aria-hidden="true" />{customer.teamName}</span>
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden="true" />创建于 {formatCrmDate(customer.createdAt)}</span>
            </div>
          </div>
          {customer.tags.length > 0 ? <div className="flex max-w-full flex-wrap gap-2 sm:max-w-sm sm:justify-end">{customer.tags.map((tag) => <Badge key={tag} className="max-w-full whitespace-normal break-words bg-white/10 text-indigo-100 ring-white/15 [overflow-wrap:anywhere]">{tag}</Badge>)}</div> : null}
        </div>
      </div>
    </div>
  );
}
