"use client";

import * as React from "react";
import { CheckCircle2, LoaderCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AiBrainContext, KnowledgeFeedbackType } from "@/apps/team-os/features/ai-brain/types";
import { AiBrainClientError, submitAiBrainFeedback } from "@/apps/team-os/features/ai-brain/services/ai-brain-client";

const feedbackOptions: Array<{ value: KnowledgeFeedbackType; label: string; description: string }> = [
  { value: "GOOD", label: "回答有效", description: "回答准确且解决了问题" },
  { value: "BAD", label: "回答有误", description: "内容错误或建议不可执行" },
  { value: "MISSING", label: "知识缺失", description: "AI 没有给出有效答案" }
];

export function KnowledgeFeedbackForm({
  context,
  onSubmitted
}: {
  context: AiBrainContext;
  onSubmitted?: () => void;
}) {
  const availableTeams = React.useMemo(
    () => context.teams.filter((team) => context.feedbackTeamIds.includes(team.id)),
    [context.feedbackTeamIds, context.teams]
  );
  const [teamId, setTeamId] = React.useState(availableTeams.length === 1 ? availableTeams[0]?.id ?? "" : "");
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [feedbackType, setFeedbackType] = React.useState<KnowledgeFeedbackType>("MISSING");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    setTeamId(availableTeams.length === 1 ? availableTeams[0]?.id ?? "" : "");
  }, [availableTeams, context.companyId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (!question.trim()) {
      setError("请填写本次向 AI 提出的问题。");
      return;
    }
    if (feedbackType !== "MISSING" && !answer.trim()) {
      setError("请填写需要评价的 AI 回答。");
      return;
    }
    if (context.permissionLevel !== "OWNER" && !teamId) {
      setError("请选择反馈所属团队。");
      return;
    }
    setSubmitting(true);
    try {
      await submitAiBrainFeedback({
        companyId: context.companyId,
        ...(teamId ? { teamId } : {}),
        question: question.trim(),
        ...(answer.trim() ? { answer: answer.trim() } : {}),
        feedbackType,
        ...(comment.trim() ? { comment: comment.trim() } : {})
      });
      setQuestion("");
      setAnswer("");
      setComment("");
      setSuccess(true);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof AiBrainClientError ? caught.message : "反馈提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5 text-indigo-700" aria-hidden="true" />提交 AI 回答反馈</CardTitle>
        <p className="text-sm leading-6 text-slate-500">反馈只进入当前企业的 AI Brain 分析队列，不会绕过人工审核直接写入知识库。</p>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-3">
            {feedbackOptions.map((option) => (
              <label key={option.value} className={`cursor-pointer rounded-xl border p-4 transition ${feedbackType === option.value ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 hover:bg-slate-50"}`}>
                <input className="sr-only" type="radio" name="feedbackType" value={option.value} checked={feedbackType === option.value} onChange={() => setFeedbackType(option.value)} disabled={submitting} />
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
              </label>
            ))}
          </div>

          {availableTeams.length > 0 ? (
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              所属团队{context.permissionLevel === "OWNER" ? "（可选）" : ""}
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" disabled={submitting}>
                <option value="">{context.permissionLevel === "OWNER" ? "企业级反馈" : "请选择团队"}</option>
                {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          ) : null}

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            你的问题
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} disabled={submitting} className="min-h-24" placeholder="请尽量保留完整业务语境，但不要填写客户手机号、微信号等个人信息。" />
            <span className="block text-right text-xs font-normal text-slate-400">{question.length}/2000</span>
          </label>

          {feedbackType !== "MISSING" ? (
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              AI 回答
              <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={10000} disabled={submitting} className="min-h-32" placeholder="粘贴需要评价的 AI 回答。" />
              <span className="block text-right text-xs font-normal text-slate-400">{answer.length}/10000</span>
            </label>
          ) : null}

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            补充说明（可选）
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} disabled={submitting} className="min-h-20" placeholder="例如：缺少产品时效说明，或建议补充可执行步骤。" />
          </label>

          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
          {success ? <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />反馈已提交，感谢帮助企业 AI 持续改进。</p> : null}
          <Button type="submit" disabled={submitting || !context.canSubmitFeedback}>
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "提交中…" : "提交反馈"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
