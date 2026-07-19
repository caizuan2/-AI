import Link from "next/link";
import { ArrowRight, CircleUserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CoachTeamMemberSummary } from "@/apps/team-os/features/ai-coach/types";

export function TeamAnalysisList({ members }: { members: CoachTeamMemberSummary[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {members.map((member) => (
        <Card key={`${member.teamId}-${member.userId}`}>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CircleUserRound className="h-10 w-10 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{member.employeeName}</p><p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{member.teamName}</p></div>
                  {typeof member.score === "number" ? <Badge className="bg-indigo-50 text-indigo-700">{member.score} 分</Badge> : <Badge variant="secondary">今日未分析</Badge>}
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">主要问题</p><p className="mt-1 line-clamp-2 break-words text-slate-700 [overflow-wrap:anywhere]">{member.mainProblem || "暂无"}</p></div>
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">训练建议</p><p className="mt-1 line-clamp-2 break-words text-slate-700 [overflow-wrap:anywhere]">{member.trainingPlan || "待生成"}</p></div>
                </div>
                {member.reportId ? (
                  <div className="mt-4 flex justify-end"><Link href={`/team-os/ai-coach/report/${encodeURIComponent(member.reportId)}`} className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:text-indigo-900">查看报告<ArrowRight className="h-4 w-4" /></Link></div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
