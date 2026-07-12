import { Bot, CalendarDays, CircleUserRound, MessageSquareQuote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOLLOW_UP_TYPE_LABELS, formatCrmDate } from "@/apps/team-os/features/crm/components/crm-ui";
import type { CustomerFollowUpRecord } from "@/apps/team-os/features/crm/types";

export function CustomerFollowUpTimeline({ items, truncated = false }: { items: CustomerFollowUpRecord[]; truncated?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>跟进记录</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <div className="flex min-h-40 items-center justify-center text-center text-sm text-slate-500">暂无跟进记录，添加首次沟通后会显示在这里。</div> : (
          <ol className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2"><Badge variant="outline">{FOLLOW_UP_TYPE_LABELS[item.type]}</Badge><span className="inline-flex max-w-full min-w-0 items-center gap-1.5 break-words text-xs text-slate-500 [overflow-wrap:anywhere]"><CircleUserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{item.userName}</span></div><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatCrmDate(item.createdAt)}</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3 sm:col-span-2"><p className="text-xs text-slate-500">文字记录</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{item.content}</p></div>
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">沟通总结</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{item.summary}</p></div>
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">下一步计划</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{item.nextPlan}</p></div>
                </div>
                {item.aiSuggestion ? <div className="mt-3 space-y-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div><p className="flex items-center gap-2 text-xs font-medium text-indigo-700"><Bot className="h-4 w-4" aria-hidden="true" />AI 建议</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-indigo-950 [overflow-wrap:anywhere]">{item.aiSuggestion}</p></div>{item.aiRecommendedScript ? <div className="rounded-lg bg-white/80 p-3"><p className="flex items-center gap-2 text-xs font-medium text-indigo-700"><MessageSquareQuote className="h-4 w-4" aria-hidden="true" />推荐话术</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">{item.aiRecommendedScript}</p></div> : null}</div> : null}
              </li>
            ))}
          </ol>
        )}
        {truncated ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800" role="status">当前仅显示最近 100 条跟进记录，更早记录暂未加载。</p> : null}
      </CardContent>
    </Card>
  );
}
