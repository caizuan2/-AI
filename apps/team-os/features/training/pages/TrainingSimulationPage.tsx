"use client";

import * as React from "react";
import Link from "next/link";
import { Award, Bot, CheckCircle2, LoaderCircle, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CourseBadges } from "@/apps/team-os/features/training/components/TrainingBadges";
import { TrainingCompanySelector } from "@/apps/team-os/features/training/components/TrainingCompanySelector";
import { TrainingSectionNavigation } from "@/apps/team-os/features/training/components/TrainingSectionNavigation";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import { useTrainingCourses } from "@/apps/team-os/features/training/hooks/useTrainingCourses";
import {
  generateTrainingSimulation,
  startTrainingCourse,
  submitTrainingEvaluation
} from "@/apps/team-os/features/training/services/training-client";
import type { TrainingEvaluationResult, TrainingSimulationData } from "@/apps/team-os/features/training/types";

const linkButton = "focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50";

export function TrainingSimulationPage({ initialCourseId }: { initialCourseId?: string }) {
  const [companyId, setCompanyId] = React.useState<string>();
  const courses = useTrainingCourses({ companyId, status: "ACTIVE" });
  const [selectedCourseId, setSelectedCourseId] = React.useState(initialCourseId ?? "");
  const [scenario, setScenario] = React.useState<TrainingSimulationData | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [result, setResult] = React.useState<TrainingEvaluationResult | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [evaluating, setEvaluating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!courses.data) return;
    if (!courses.data.items.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses.data.items[0]?.id ?? "");
      setScenario(null);
      setResult(null);
      setAnswer("");
    }
  }, [courses.data, selectedCourseId]);

  const selectedCourse = courses.data?.items.find((course) => course.id === selectedCourseId);

  async function generateScenario() {
    if (!selectedCourseId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setAnswer("");
    try {
      await startTrainingCourse(selectedCourseId);
      setScenario(await generateTrainingSimulation(selectedCourseId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 模拟场景生成失败，请重试。");
    } finally {
      setGenerating(false);
    }
  }

  async function evaluateAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scenario || !answer.trim()) {
      setError("请先填写对模拟客户的完整回答。");
      return;
    }
    setEvaluating(true);
    setError(null);
    try {
      setResult(await submitTrainingEvaluation({
        courseId: scenario.courseId,
        question: scenario.question,
        answer: answer.trim(),
        scenarioToken: scenario.scenarioToken
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 训练评分失败，请重试。");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div><p className="text-sm font-medium text-indigo-700">AI Simulation</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">AI 模拟训练</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">AI 根据企业课程与授权知识生成客户场景；提交回答后获得评分、反馈和改进建议。</p></div>
      <TrainingSectionNavigation />

      {courses.data ? <TrainingCompanySelector companyId={courses.data.context.companyId} companyName={courses.data.context.companyName} companies={courses.data.context.companies} disabled={courses.loading || generating || evaluating} onChange={(nextCompanyId) => { setCompanyId(nextCompanyId); setScenario(null); setResult(null); setAnswer(""); setError(null); }} /> : null}
      {courses.error && courses.data ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{courses.error.message}</p> : null}
      {courses.data?.truncated ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">启用课程超过展示上限，当前仅列出最近更新的 200 门课程。请先在课程中心筛选目标课程，再进入模拟训练。</p> : null}

      {courses.loading ? <TrainingLoadingState label="正在准备可训练课程…" /> : courses.error && !courses.data ? <TrainingErrorState message={courses.error.message} onRetry={() => void courses.reload()} /> : !courses.data || courses.data.items.length === 0 ? <TrainingEmptyState title="暂无可训练课程" description="企业需要先发布至少一门启用课程，才能生成 AI 模拟场景。" action={<Link href="/team-os/training/courses" className={linkButton}>前往课程中心</Link>} /> : (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-700" />选择训练课程</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <select value={selectedCourseId} onChange={(event) => { setSelectedCourseId(event.target.value); setScenario(null); setResult(null); setAnswer(""); setError(null); }} disabled={generating || evaluating} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium shadow-sm">
                {courses.data.items.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
              {selectedCourse ? <div className="rounded-xl bg-slate-50 p-4"><CourseBadges category={selectedCourse.category} level={selectedCourse.level} status={selectedCourse.status} /><p className="mt-3 text-sm leading-6 text-slate-600">{selectedCourse.description}</p></div> : null}
              <div className="flex flex-wrap gap-3"><Button onClick={() => void generateScenario()} disabled={!selectedCourseId || generating || evaluating}>{generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : scenario ? <RefreshCw className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}{generating ? "AI 正在生成场景…" : scenario ? "生成新场景" : "生成模拟场景"}</Button><Link href={`/team-os/training/courses?courseId=${encodeURIComponent(selectedCourseId)}`} className={linkButton}>复习课程内容</Link></div>
            </CardContent>
          </Card>

          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">{error}</p> : null}

          {!scenario && !generating ? <TrainingEmptyState title="等待生成训练场景" description="选择课程后，AI 会生成一个与课程难度匹配的真实业务问题。AI 服务暂时不可用时仍可返回课程中心学习。" /> : null}

          {scenario ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-700" />模拟客户</CardTitle><p className="text-xs text-slate-500">{scenario.courseTitle}</p></CardHeader>
                <CardContent className="space-y-5"><div className="rounded-2xl rounded-tl-sm bg-slate-100 p-5 text-base leading-8 text-slate-800 whitespace-pre-wrap break-words">{scenario.question}</div><form className="space-y-4" onSubmit={evaluateAnswer}><label className="space-y-2 text-sm font-medium text-slate-700">你的回答<Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={20000} disabled={evaluating || Boolean(result)} placeholder="像真实沟通一样回复客户，说明你的判断、话术与下一步行动。" className="min-h-48" /></label><div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{answer.length}/20000</span><Button type="submit" disabled={evaluating || Boolean(result) || !answer.trim()}>{evaluating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{evaluating ? "AI 正在评分…" : result ? "已完成评分" : "提交回答"}</Button></div></form></CardContent>
              </Card>

              {result ? (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-emerald-700" />训练评分</CardTitle></CardHeader>
                  <CardContent className="space-y-5"><div className="flex items-end gap-2"><span className="text-5xl font-semibold text-emerald-800">{result.score}</span><span className="pb-1 text-sm text-emerald-700">/ 100 分</span></div><div className="h-2.5 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.score}><div className="h-full rounded-full bg-emerald-600" style={{ width: `${result.score}%` }} /></div><div><p className="font-semibold text-slate-900">AI 反馈</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{result.feedback}</p></div>{result.suggestions.length > 0 ? <div><p className="font-semibold text-slate-900">改进建议</p><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{result.suggestions.map((suggestion) => <li key={suggestion} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-indigo-600" />{suggestion}</li>)}</ul></div> : null}<div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => void generateScenario()}><RefreshCw className="h-4 w-4" />再练一次</Button><Link href="/team-os/training/records" className={linkButton}>查看学习记录</Link></div></CardContent>
                </Card>
              ) : (
                <Card><CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center"><Award className="h-10 w-10 text-slate-300" /><p className="mt-4 font-medium text-slate-800">提交后显示 AI 评分</p><p className="mt-2 text-sm leading-6 text-slate-500">评分标准保存在服务端，员工回答不会进入知识库检索。</p><Badge className="mt-4" variant="outline">60 分及以上完成课程</Badge></CardContent></Card>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
