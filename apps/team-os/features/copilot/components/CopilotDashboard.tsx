import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CopilotMetric,
  CopilotPriority,
  CopilotSection
} from "@/apps/team-os/features/copilot/types";
import { CopilotEmptyState } from "@/apps/team-os/features/copilot/components/CopilotState";

const toneStyles: Record<CopilotMetric["tone"], string> = {
  indigo: "border-indigo-100 bg-indigo-50/60 text-indigo-800",
  emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-800",
  amber: "border-amber-100 bg-amber-50/60 text-amber-800",
  rose: "border-rose-100 bg-rose-50/60 text-rose-800",
  sky: "border-sky-100 bg-sky-50/60 text-sky-800"
};

function priorityBadge(priority: CopilotPriority) {
  if (priority === "HIGH") return <Badge className="bg-rose-50 text-rose-700 ring-rose-100">高优先级</Badge>;
  if (priority === "MEDIUM") return <Badge variant="warning">中优先级</Badge>;
  return <Badge variant="secondary">建议关注</Badge>;
}

export function CopilotMetricGrid({ metrics }: { metrics: CopilotMetric[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.id} className={toneStyles[metric.tone]}>
          <CardContent className="p-5">
            <p className="text-xs font-semibold opacity-75">{metric.label}</p>
            <p className="mt-3 text-2xl font-bold tracking-tight">{metric.value}</p>
            <p className="mt-2 text-xs leading-5 opacity-75">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CopilotSections({ sections }: { sections: CopilotSection[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.id} className="min-w-0">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">{section.emptyMessage}</p>
            ) : section.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{item.title}</p>
                  {priorityBadge(item.priority)}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.description}</p>
                {item.href ? <Link href={item.href} className="focus-ring mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-indigo-700 hover:text-indigo-900">查看相关数据 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CopilotSummary({ greeting, summary, insightCount }: { greeting: string; summary: string; insightCount: number }) {
  return (
    <Card className="border-indigo-100 bg-slate-950 text-white">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-indigo-200">
          <Lightbulb className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{greeting}</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">{summary}</p>
        </div>
        <Badge className="bg-white/10 text-white ring-white/15">{insightCount} 条主动洞察</Badge>
      </CardContent>
    </Card>
  );
}

export function CopilotNoSections() {
  return <CopilotEmptyState title="暂无可展示数据" description="当前授权范围内还没有任务、客户、培训或分析记录。" />;
}
