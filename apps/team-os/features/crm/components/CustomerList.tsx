import Link from "next/link";
import { CalendarClock, CircleUserRound, ExternalLink, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerLevelBadge, CustomerStageBadge } from "@/apps/team-os/features/crm/components/CrmBadges";
import { formatCrmDate } from "@/apps/team-os/features/crm/components/crm-ui";
import type { CustomerListItem } from "@/apps/team-os/features/crm/types";

export function CustomerList({ items, detailQuery }: { items: CustomerListItem[]; detailQuery: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((customer) => (
        <Card key={customer.id} className="min-w-0 border-slate-200">
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <CardTitle className="min-w-0 flex-1 break-words text-lg [overflow-wrap:anywhere]">{customer.name}</CardTitle>
              <div className="flex shrink-0 flex-wrap gap-2"><CustomerStageBadge stage={customer.stage} /><CustomerLevelBadge level={customer.level} /></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
              <p className="flex min-w-0 items-center gap-2"><CircleUserRound className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">负责人：{customer.ownerName}</span></p>
              <p className="flex min-w-0 items-center gap-2"><UsersRound className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{customer.teamName}</span></p>
              <p className="min-w-0 break-words [overflow-wrap:anywhere]">来源：{customer.source || "未填写"}</p>
              <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />最后跟进：{formatCrmDate(customer.lastFollowUpAt)}</p>
            </div>
            {customer.tags.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{customer.tags.slice(0, 6).map((tag) => <Badge key={tag} variant="secondary" className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">{tag}</Badge>)}{customer.tags.length > 6 ? <Badge variant="outline">+{customer.tags.length - 6}</Badge> : null}</div> : null}
            <div className="mt-5 flex justify-end"><Link href={`/team-os/crm/customer/${encodeURIComponent(customer.id)}${detailQuery ? `?${detailQuery}` : ""}`} className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-800">查看详情<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
