import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, GraduationCap, Lightbulb, ListChecks, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  CopilotInsightRecord,
  CopilotInsightType,
  CopilotPriority
} from "@/apps/team-os/features/copilot/types";

const typeLabels: Record<CopilotInsightType, string> = {
  TASK: "任务",
  CRM: "客户",
  TRAINING: "培训",
  TEAM: "团队",
  BUSINESS: "经营"
};

const priorityLabels: Record<CopilotPriority, string> = {
  HIGH: "高优先级",
  MEDIUM: "中优先级",
  LOW: "建议关注"
};

const insightLinks: Partial<Record<CopilotInsightType, string>> = {
  TASK: "/team-os/tasks",
  CRM: "/team-os/crm",
  TRAINING: "/team-os/training",
  TEAM: "/team-os/organization/members",
  BUSINESS: "/team-os/analytics"
};

function InsightIcon({ type }: { type: CopilotInsightType }) {
  const Icon = type === "TASK"
    ? ListChecks
    : type === "CRM"
      ? BriefcaseBusiness
      : type === "TRAINING"
        ? GraduationCap
        : type === "TEAM"
          ? UsersRound
          : Lightbulb;
  return <Icon className="h-5 w-5" aria-hidden="true" />;
}

function formatInsightTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function CopilotInsightList({ items }: { items: CopilotInsightRecord[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const high = item.priority === "HIGH";
        const href = insightLinks[item.type];
        return (
          <Card key={item.id} className={high ? "border-rose-200" : "border-slate-200"}>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${high ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-700"}`}>
                  <InsightIcon type={item.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{typeLabels[item.type]}</Badge>
                    <Badge className={high ? "bg-rose-50 text-rose-700 ring-rose-100" : item.priority === "MEDIUM" ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                      {priorityLabels[item.priority]}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatInsightTime(item.createdAt)}</span>
                  </div>
                  <h2 className="mt-3 text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.content}</p>
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      建议行动
                    </p>
                    <p className="mt-2 text-sm leading-6 text-emerald-900 [overflow-wrap:anywhere]">{item.recommendation}</p>
                  </div>
                  {href ? (
                    <Link href={href} className="focus-ring mt-4 inline-flex items-center gap-1 rounded text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                      查看相关模块 <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
