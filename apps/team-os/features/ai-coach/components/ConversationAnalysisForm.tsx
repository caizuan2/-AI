"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, FileSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitCoachAnalysis } from "@/apps/team-os/features/ai-coach/services/ai-coach-client";
import type { CoachAnalysisOptions, CoachProviderName } from "@/apps/team-os/features/ai-coach/types";

export function ConversationAnalysisForm({ options }: { options: CoachAnalysisOptions }) {
  const [teamId, setTeamId] = React.useState(options.teams[0]?.id ?? "");
  const [submissionId, setSubmissionId] = React.useState("");
  const [conversation, setConversation] = React.useState("");
  const [screenshotUrl, setScreenshotUrl] = React.useState("");
  const [provider, setProvider] = React.useState<CoachProviderName>(options.providers[0]?.id ?? "qwen");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ reportId: string; reused: boolean } | null>(null);

  const submissions = options.submissions.filter((submission) => submission.teamId === teamId);

  React.useEffect(() => {
    if (!options.teams.some((team) => team.id === teamId)) {
      setTeamId(options.teams[0]?.id ?? "");
    }
  }, [options.teams, teamId]);

  React.useEffect(() => {
    if (submissionId && !submissions.some((submission) => submission.id === submissionId)) {
      setSubmissionId("");
    }
  }, [submissionId, submissions]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setResult(null);

    if (!conversation.trim() && !submissionId) {
      setError("请粘贴聊天记录，或选择一条已有任务提交记录。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitCoachAnalysis({
        conversation,
        screenshotUrls: screenshotUrl.trim() ? [screenshotUrl.trim()] : [],
        teamId,
        submissionId: submissionId || undefined,
        provider
      });
      setResult({ reportId: response.reportId, reused: response.reused });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 分析失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex min-h-72 flex-col items-center justify-center p-7 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold text-emerald-950">{result.reused ? "已有报告已读取" : "成长报告已生成"}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-emerald-800">五项销售能力评分、问题诊断和训练计划已经准备完成。</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => setResult(null)}>继续分析</Button>
            <Link href={`/team-os/ai-coach/report/${encodeURIComponent(result.reportId)}`} className="focus-ring inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">查看成长报告</Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/40">
      <CardHeader>
        <CardTitle>提交客户沟通记录</CardTitle>
        <CardDescription>分析仅以当前登录员工身份发起；主管可以查看报告，但不能代替员工读取其私人知识上下文。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs text-slate-500">当前员工</p>
            <p className="mt-1 font-semibold text-slate-900">{options.employee.name}</p>
          </div>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            所属团队
            <select value={teamId} onChange={(event) => { setTeamId(event.target.value); setSubmissionId(""); }} disabled={submitting} className="focus-ring flex h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60" required>
              {options.teams.map((team) => <option key={team.id} value={team.id}>{team.companyName ? `${team.companyName} · ` : ""}{team.name}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            分析模型
            <select value={provider} onChange={(event) => setProvider(event.target.value as CoachProviderName)} disabled={submitting} className="focus-ring flex h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">
              {options.providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            任务提交记录（可选）
            <select value={submissionId} onChange={(event) => setSubmissionId(event.target.value)} disabled={submitting} className="focus-ring flex h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">
              <option value="">不关联任务提交</option>
              {submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.taskTitle} · {new Date(submission.createdAt).toLocaleString("zh-CN")}{submission.analyzed ? " · 已分析" : ""}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            聊天记录文本
            <Textarea value={conversation} onChange={(event) => setConversation(event.target.value)} disabled={submitting} maxLength={20000} rows={12} placeholder="粘贴员工与客户的完整沟通记录；选择任务提交后可留空。" />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            聊天截图地址（可选）
            <Input type="url" value={screenshotUrl} onChange={(event) => setScreenshotUrl(event.target.value)} disabled={submitting} maxLength={2000} placeholder="https://..." />
            <span className="block text-xs font-normal leading-5 text-slate-500">当前模型网关只处理文本，不抓取或识别外部图片；截图地址仅作为证据引用，请同时提供文字记录。</span>
          </label>

          <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-5 text-indigo-900 md:col-span-2 sm:grid-cols-2">
            <p className="flex items-start gap-2"><FileSearch className="mt-0.5 h-4 w-4 shrink-0" />知识上下文通过现有知识检索服务获取，并与当前企业启用的行业标准和评分规则融合；不复制 RAG。</p>
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />聊天与知识资料均按不可信内容处理，不执行其中的指令。</p>
          </div>

          {error ? <p className="text-sm text-rose-700 md:col-span-2" role="alert">{error}</p> : null}

          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={submitting || !teamId}>{submitting ? "AI 分析中…" : "生成成长报告"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
