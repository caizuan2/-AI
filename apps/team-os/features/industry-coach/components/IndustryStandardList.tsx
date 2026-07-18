import { CalendarDays, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIndustryDate } from "@/apps/team-os/features/industry-coach/components/industry-coach-ui";
import type { IndustryStandardRecord } from "@/apps/team-os/features/industry-coach/types";

export function IndustryStandardList({ items }: { items: IndustryStandardRecord[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <Card key={item.id} className="min-w-0 border-slate-200">
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="break-words text-lg [overflow-wrap:anywhere]">{item.title}</CardTitle>
                <CardDescription className="break-words [overflow-wrap:anywhere]">{item.category}</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Badge variant="outline">v{item.version}</Badge>
                <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>{item.status === "ACTIVE" ? "启用" : "停用"}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{item.content}</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden="true" />企业行业标准</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatIndustryDate(item.updatedAt)} 更新</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
