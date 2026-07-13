"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AiBrainPageHeader } from "@/apps/team-os/features/ai-brain/components/AiBrainPageHeader";
import { AiBrainSectionNavigation } from "@/apps/team-os/features/ai-brain/components/AiBrainSectionNavigation";
import { AiBrainErrorState, AiBrainForbiddenState, AiBrainLoadingState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";
import {
  candidateSourceLabels,
  candidateStatusLabels,
  KnowledgeCandidateList
} from "@/apps/team-os/features/ai-brain/components/KnowledgeCandidateList";
import { KnowledgeExtractionPanel } from "@/apps/team-os/features/ai-brain/components/KnowledgeExtractionPanel";
import { useAiBrainCandidates } from "@/apps/team-os/features/ai-brain/hooks/useAiBrainData";
import {
  KNOWLEDGE_CANDIDATE_SOURCE_TYPES,
  KNOWLEDGE_CANDIDATE_STATUSES,
  type KnowledgeCandidateSourceType,
  type KnowledgeCandidateStatus
} from "@/apps/team-os/features/ai-brain/types";

export function AiBrainCandidatesPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const [status, setStatus] = React.useState<KnowledgeCandidateStatus>();
  const [sourceType, setSourceType] = React.useState<KnowledgeCandidateSourceType>();
  const resource = useAiBrainCandidates({ companyId, status, sourceType });
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/ai-brain/candidates?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AiBrainPageHeader
        eyebrow="Knowledge Review Center"
        title="候选知识审核"
        description="查看 AI 从授权业务记录提取的脱敏知识，企业负责人批准后才会通过适配器调用现有知识库服务。"
        context={data?.context}
        onCompanyChange={changeCompany}
      />

      {resource.loading && !data ? <AiBrainLoadingState /> : forbidden && !data ? <AiBrainForbiddenState description="普通成员不能查看候选知识；培训师只能查看培训来源，主管只能查看自己直接管理团队的候选内容。" /> : resource.error && !data ? <AiBrainErrorState message={resource.error.message} onRetry={() => void resource.reload()} /> : data && !data.context.canViewAnalysis ? (
        <>
          <AiBrainSectionNavigation context={data.context} />
          <AiBrainForbiddenState description="普通成员只能在 AI Brain 首页提交知识反馈，不能查看候选知识或企业分析。" />
        </>
      ) : data ? (
        <>
          <AiBrainSectionNavigation context={data.context} />
          <KnowledgeExtractionPanel context={data.context} onExtracted={() => void resource.reload()} />
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Filter className="h-4 w-4" aria-hidden="true" />筛选候选知识</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">审核状态</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={!status ? "secondary" : "ghost"} onClick={() => setStatus(undefined)}>全部状态</Button>
                    {KNOWLEDGE_CANDIDATE_STATUSES.map((value) => <Button key={value} size="sm" variant={status === value ? "secondary" : "ghost"} onClick={() => setStatus(value)}>{candidateStatusLabels[value]}</Button>)}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">业务来源</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={!sourceType ? "secondary" : "ghost"} onClick={() => setSourceType(undefined)}>全部来源</Button>
                    {KNOWLEDGE_CANDIDATE_SOURCE_TYPES.filter((value) => data.context.extractSourceTypes.includes(value) || data.context.permissionLevel === "OWNER").map((value) => <Button key={value} size="sm" variant={sourceType === value ? "secondary" : "ghost"} onClick={() => setSourceType(value)}>{candidateSourceLabels[value]}</Button>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {resource.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">刷新失败，当前继续展示上一次成功加载的数据：{resource.error.message}</div> : null}
          <KnowledgeCandidateList context={data.context} items={data.candidates} onReviewed={() => void resource.reload()} />
          <p className="text-right text-xs text-slate-400">当前显示 {data.candidates.length} 条候选知识</p>
        </>
      ) : null}
    </div>
  );
}
