"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AiBrainPageHeader } from "@/apps/team-os/features/ai-brain/components/AiBrainPageHeader";
import { AiBrainSectionNavigation } from "@/apps/team-os/features/ai-brain/components/AiBrainSectionNavigation";
import { AiBrainErrorState, AiBrainLoadingState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";
import { AiBrainStatsGrid, KnowledgeGrowthChart } from "@/apps/team-os/features/ai-brain/components/AiBrainOverview";
import { KnowledgeCandidateList } from "@/apps/team-os/features/ai-brain/components/KnowledgeCandidateList";
import { KnowledgeExtractionPanel } from "@/apps/team-os/features/ai-brain/components/KnowledgeExtractionPanel";
import { KnowledgeFeedbackForm } from "@/apps/team-os/features/ai-brain/components/KnowledgeFeedbackForm";
import { useAiBrainDashboard } from "@/apps/team-os/features/ai-brain/hooks/useAiBrainData";

export function AiBrainDashboardPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const dashboard = useAiBrainDashboard(companyId);
  const context = dashboard.data?.context;
  const isMember = context?.permissionLevel === "MEMBER";
  const initialLoading = !context && dashboard.loading;
  const primaryError = dashboard.error;

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/ai-brain?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AiBrainPageHeader
        eyebrow="Enterprise AI Brain"
        title="企业 AI 大脑"
        description="把授权业务经验沉淀为待审核知识，通过人工把关后再连接企业知识库，持续形成可追踪的 AI 优化闭环。"
        context={context}
        onCompanyChange={changeCompany}
        actions={context?.canViewAnalysis ? <Link href={`/team-os/ai-brain/candidates?companyId=${encodeURIComponent(context.companyId)}`} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><ListChecks className="h-4 w-4" aria-hidden="true" />审核候选知识</Link> : undefined}
      />

      {context ? <AiBrainSectionNavigation context={context} /> : null}
      {initialLoading ? <AiBrainLoadingState /> : primaryError && !context ? <AiBrainErrorState message={primaryError.message} onRetry={() => void dashboard.reload()} /> : context ? (
        <>
          {isMember ? (
            <Card className="border-indigo-100 bg-indigo-50/50">
              <CardContent className="p-5 text-sm leading-6 text-indigo-900">普通成员不会看到企业候选知识或优化数据；你可以提交自己遇到的错误回答和知识缺口，由企业负责人统一审核处理。</CardContent>
            </Card>
          ) : dashboard.data ? (
            <>
              {dashboard.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">刷新失败，当前继续展示上一次成功加载的数据：{dashboard.error.message}</div> : null}
              <AiBrainStatsGrid stats={dashboard.data.stats} />
              <KnowledgeGrowthChart points={dashboard.data.growth} />
              <KnowledgeExtractionPanel context={context} onExtracted={() => void dashboard.reload()} />
              <section className="space-y-4" aria-labelledby="recent-ai-brain-candidates">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h2 id="recent-ai-brain-candidates" className="text-xl font-semibold text-slate-950">最近候选知识</h2><p className="mt-1 text-sm text-slate-500">所有业务经验都必须经过人工审核后才会尝试发布。</p></div>
                  <Link href={`/team-os/ai-brain/candidates?companyId=${encodeURIComponent(context.companyId)}`} className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-50">查看全部<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </div>
                <KnowledgeCandidateList context={context} items={dashboard.data.candidates} compact onReviewed={() => void dashboard.reload()} />
              </section>
            </>
          ) : dashboard.loading ? <AiBrainLoadingState /> : dashboard.error ? <AiBrainErrorState message={dashboard.error.message} onRetry={() => void dashboard.reload()} /> : null}

          <KnowledgeFeedbackForm context={context} />
        </>
      ) : null}
    </div>
  );
}
