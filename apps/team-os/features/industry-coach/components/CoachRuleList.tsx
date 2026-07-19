import { CalendarDays, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIndustryDate, INDUSTRY_COACH_SKILLS } from "@/apps/team-os/features/industry-coach/components/industry-coach-ui";
import type { CoachRuleRecord } from "@/apps/team-os/features/industry-coach/types";

export function CoachRuleList({ items }: { items: CoachRuleRecord[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <Card key={item.id} className="min-w-0 border-slate-200">
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="break-words text-lg [overflow-wrap:anywhere]">{item.name}</CardTitle>
                <CardDescription className="break-words [overflow-wrap:anywhere]">{item.description || "暂未填写规则说明。"}</CardDescription>
              </div>
              <Badge variant="outline">总分 100</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {INDUSTRY_COACH_SKILLS.map((skill) => {
                const dimension = item.rules.dimensions[skill.key];
                return (
                  <div key={skill.key} className="min-w-0 rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium text-slate-800">{skill.label}</span><span className="shrink-0 text-xs text-indigo-700">{dimension.weight} 分</span></div>
                    <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-4 pr-2 text-xs leading-5 text-slate-500">
                      {dimension.criteria.map((criterion, index) => <li key={index} className="break-words [overflow-wrap:anywhere]">{criterion}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" aria-hidden="true" />五维等权评分</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatIndustryDate(item.createdAt)} 创建</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
