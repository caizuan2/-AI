"use client";

import * as React from "react";
import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AiBrainContext, KnowledgeCandidateSourceType } from "@/apps/team-os/features/ai-brain/types";
import { AiBrainClientError, extractAiBrainKnowledge } from "@/apps/team-os/features/ai-brain/services/ai-brain-client";

const sourceLabels: Record<KnowledgeCandidateSourceType, string> = {
  CHAT: "高质量任务回答",
  CRM: "CRM 成交案例",
  AI_COACH: "AI 教练优秀报告",
  TRAINING: "培训优秀答案",
  WORKFLOW: "工作流执行经验"
};

export function KnowledgeExtractionPanel({ context, onExtracted }: { context: AiBrainContext; onExtracted?: () => void }) {
  const sourceTypes = context.extractSourceTypes;
  const availableTeams = React.useMemo(
    () => context.teams.filter((team) => context.visibleTeamIds.includes(team.id)),
    [context.teams, context.visibleTeamIds]
  );
  const [sourceType, setSourceType] = React.useState<KnowledgeCandidateSourceType>(sourceTypes[0] ?? "TRAINING");
  const [sourceId, setSourceId] = React.useState("");
  const [teamId, setTeamId] = React.useState(availableTeams.length === 1 ? availableTeams[0]?.id ?? "" : "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTeamId(availableTeams.length === 1 ? availableTeams[0]?.id ?? "" : "");
    setSourceType(sourceTypes[0] ?? "TRAINING");
    setSourceId("");
    setError(null);
    setSuccess(null);
  }, [availableTeams, context.companyId, sourceTypes]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!sourceId.trim()) {
      setError("请填写要提取的业务来源记录 ID。");
      return;
    }
    if (context.permissionLevel !== "OWNER" && !teamId) {
      setError("请选择来源所属团队。");
      return;
    }
    setSubmitting(true);
    try {
      const candidate = await extractAiBrainKnowledge({
        companyId: context.companyId,
        ...(teamId ? { teamId } : {}),
        sourceType,
        sourceId: sourceId.trim()
      });
      setSuccess(candidate.status === "APPROVED"
        ? `知识“${candidate.title}”已在此前审核并发布，本次未重复创建。`
        : candidate.status === "REVIEWING"
          ? `候选知识“${candidate.title}”正在审核或发布，本次未重复创建。`
          : `已生成候选知识“${candidate.title}”，等待人工审核。`);
      setSourceId("");
      onExtracted?.();
    } catch (caught) {
      setError(caught instanceof AiBrainClientError ? caught.message : "知识提取失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (!context.canExtract || sourceTypes.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-700" aria-hidden="true" />从业务来源提取知识</CardTitle>
        <p className="text-sm leading-6 text-slate-500">系统只读取当前角色有权访问的真实记录，并在脱敏后生成待审核候选；此操作不会直接发布知识。</p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            来源类型
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as KnowledgeCandidateSourceType)} className="focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" disabled={submitting}>
              {sourceTypes.map((type) => <option key={type} value={type}>{sourceLabels[type]}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            来源团队{context.permissionLevel === "OWNER" ? "（可选）" : ""}
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" disabled={submitting}>
              <option value="">{context.permissionLevel === "OWNER" ? "企业级来源" : "请选择团队"}</option>
              {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            业务来源记录 ID
            <Input value={sourceId} onChange={(event) => setSourceId(event.target.value)} maxLength={160} disabled={submitting} placeholder="输入报告、客户、提交、训练或工作流 ID" />
          </label>
          <Button className="h-11" type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "提取中…" : "生成候选"}
          </Button>
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 lg:col-span-4" role="alert">{error}</p> : null}
          {success ? <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 lg:col-span-4" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{success}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
