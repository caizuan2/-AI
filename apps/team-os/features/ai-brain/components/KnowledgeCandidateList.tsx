"use client";

import * as React from "react";
import { Check, ExternalLink, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AiBrainEmptyState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";
import { AiBrainClientError, reviewAiBrainCandidate } from "@/apps/team-os/features/ai-brain/services/ai-brain-client";
import type {
  AiBrainContext,
  KnowledgeCandidateRecord,
  KnowledgeCandidateSourceType,
  KnowledgeCandidateStatus
} from "@/apps/team-os/features/ai-brain/types";

export const candidateSourceLabels: Record<KnowledgeCandidateSourceType, string> = {
  CHAT: "高质量回答",
  CRM: "CRM 成交案例",
  AI_COACH: "AI 教练",
  TRAINING: "培训答案",
  WORKFLOW: "工作流经验"
};

export const candidateStatusLabels: Record<KnowledgeCandidateStatus, string> = {
  PENDING: "待审核",
  REVIEWING: "审核中",
  APPROVED: "已批准",
  REJECTED: "已拒绝"
};

function statusVariant(status: KnowledgeCandidateStatus): "default" | "secondary" | "outline" | "warning" {
  if (status === "APPROVED") return "default";
  if (status === "PENDING" || status === "REVIEWING") return "warning";
  return "secondary";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function KnowledgeCandidateList({
  context,
  items,
  compact = false,
  onReviewed
}: {
  context: AiBrainContext;
  items: KnowledgeCandidateRecord[];
  compact?: boolean;
  onReviewed?: () => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const teamNames = React.useMemo(() => new Map(context.teams.map((team) => [team.id, team.name])), [context.teams]);

  async function review(candidate: KnowledgeCandidateRecord, decision: "APPROVE" | "REJECT") {
    setActiveId(candidate.id);
    setErrors((current) => ({ ...current, [candidate.id]: "" }));
    try {
      await reviewAiBrainCandidate({
        companyId: context.companyId,
        candidateId: candidate.id,
        decision,
        ...(notes[candidate.id]?.trim() ? { note: notes[candidate.id].trim() } : {})
      });
      onReviewed?.();
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [candidate.id]: caught instanceof AiBrainClientError ? caught.message : "审核操作失败，请稍后重试。"
      }));
    } finally {
      setActiveId(null);
    }
  }

  if (items.length === 0) {
    return <AiBrainEmptyState title="暂无候选知识" description="从授权业务记录提取知识后，候选内容会先进入人工审核队列。" />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((candidate) => {
        const reviewable = context.canReview && candidate.status === "PENDING";
        return (
          <Card key={candidate.id} className="overflow-hidden">
            <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{candidateSourceLabels[candidate.sourceType]}</Badge>
                    <Badge variant={statusVariant(candidate.status)}>{candidateStatusLabels[candidate.status]}</Badge>
                    <Badge variant="secondary">{candidate.category}</Badge>
                  </div>
                  <CardTitle className="break-words text-lg">{candidate.title}</CardTitle>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatDate(candidate.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-500">{candidate.teamId ? `团队：${teamNames.get(candidate.teamId) ?? "授权团队"}` : "企业级候选"}</p>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <p className={`${compact ? "line-clamp-5" : "max-h-80 overflow-y-auto"} whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]`}>{candidate.content}</p>
              {candidate.reviewNote ? <div className="break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-600 [overflow-wrap:anywhere]"><span className="font-semibold text-slate-800">审核说明：</span>{candidate.reviewNote}</div> : null}
              {context.canReview && candidate.status === "REVIEWING" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">该候选正在发布或上次发布结果未知。为避免重复入库，界面已锁定审核操作，请先核对知识库结果。</div> : null}
              {candidate.publishedKnowledgeId ? <p className="flex items-center gap-2 text-xs font-medium text-emerald-700"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />已由知识库服务确认发布</p> : null}

              {reviewable ? (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <label className="space-y-2 text-xs font-medium text-slate-600">
                    审核说明（可选）
                    <Textarea
                      value={notes[candidate.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [candidate.id]: event.target.value }))}
                      maxLength={2000}
                      disabled={activeId === candidate.id}
                      className="min-h-20 bg-white text-sm"
                      placeholder="记录批准依据或拒绝原因。"
                    />
                  </label>
                  {errors[candidate.id] ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{errors[candidate.id]}</p> : null}
                  <div className="flex flex-wrap gap-3">
                    <Button size="sm" onClick={() => void review(candidate, "APPROVE")} disabled={activeId === candidate.id}>
                      {activeId === candidate.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                      批准并调用知识库服务
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void review(candidate, "REJECT")} disabled={activeId === candidate.id}>
                      <X className="h-4 w-4" aria-hidden="true" />拒绝
                    </Button>
                  </div>
                  <p className="flex gap-2 text-xs leading-5 text-slate-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />批准仅在知识库适配器确认保存成功后生效；连接不可用时不会误标为已批准。</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
