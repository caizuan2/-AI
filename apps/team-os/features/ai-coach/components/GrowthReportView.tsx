import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, Target, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoachScoreBar } from "@/apps/team-os/features/ai-coach/components/CoachScoreBar";
import type { CoachReport } from "@/apps/team-os/features/ai-coach/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function scoreTone(score: number) {
  if (score >= 85) return "优秀";
  if (score >= 70) return "良好";
  if (score >= 60) return "达标";
  return "重点提升";
}

export function GrowthReportView({ report }: { report: CoachReport }) {
  const strongestSkills = [...report.skills].sort((left, right) => right.score - left.score).slice(0, 2);

  return (
    <div className="space-y-6">
      <Link href="/team-os/ai-coach" className="focus-ring inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" />返回 AI 教练
      </Link>

      <Card className="overflow-hidden border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 text-white shadow-xl shadow-indigo-100">
        <CardContent className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[220px_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <div className="grid h-44 w-44 place-items-center rounded-full border border-white/15 bg-white/10 text-center shadow-inner">
              <div><p className="text-5xl font-semibold tracking-tight">{report.score}</p><p className="mt-1 text-sm text-indigo-200">今日评分 / 100</p></div>
            </div>
          </div>
          <div>
            <Badge className="bg-white/10 text-indigo-100 ring-white/15">员工每日成长报告</Badge>
            <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{report.employeeName}</h1>
            <p className="mt-2 break-words text-sm text-indigo-200 [overflow-wrap:anywhere]">{report.teamName} · {scoreTone(report.score)}</p>
            <p className="mt-5 max-w-2xl break-words text-sm leading-7 text-slate-200 [overflow-wrap:anywhere]">{report.summary}</p>
            <p className="mt-5 inline-flex items-center gap-2 text-xs text-indigo-200"><CalendarDays className="h-4 w-4" />{formatDate(report.createdAt)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>销售能力评分</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {report.skills.map((skill) => <CoachScoreBar key={skill.key} label={skill.label} score={skill.score} maxScore={skill.maxScore} level={skill.level} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>今日优势</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {strongestSkills.map((skill) => (
              <div key={skill.key} className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span><strong>{skill.label}</strong>表现相对突出，当前评分 {skill.score}/20。</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TriangleAlert className="h-5 w-5 text-amber-600" />主要问题</CardTitle></CardHeader>
          <CardContent>
            {report.problems.length > 0 ? <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {report.problems.map((problem, index) => <li key={`${problem}-${index}`} className="break-words rounded-xl bg-amber-50 px-4 py-3 [overflow-wrap:anywhere]"><span className="mr-2 font-semibold text-amber-700">{index + 1}.</span>{problem}</li>)}
            </ul> : <p className="text-sm text-slate-500">本次沟通未发现需要单列的明显问题。</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-indigo-600" />AI 指导建议</CardTitle></CardHeader>
          <CardContent>
            {report.suggestions.length > 0 ? <ul className="space-y-3 text-sm leading-6 text-slate-700">
              {report.suggestions.map((suggestion, index) => <li key={`${suggestion}-${index}`} className="break-words rounded-xl bg-indigo-50 px-4 py-3 [overflow-wrap:anywhere]"><span className="mr-2 font-semibold text-indigo-700">{index + 1}.</span>{suggestion}</li>)}
            </ul> : <p className="text-sm text-slate-500">暂无额外建议，请继续保持当前节奏。</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-200 bg-violet-50/60">
        <CardHeader><CardTitle>明日训练计划</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap break-words text-sm leading-7 text-violet-950 [overflow-wrap:anywhere]">{report.trainingPlan}</p></CardContent>
      </Card>
    </div>
  );
}
