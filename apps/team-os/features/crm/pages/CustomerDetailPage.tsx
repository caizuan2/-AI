"use client";

import * as React from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerAnalysisPanel } from "@/apps/team-os/features/crm/components/CustomerAnalysisPanel";
import { CustomerAIProfileCard } from "@/apps/team-os/features/crm/components/CustomerAIProfileCard";
import { CustomerBasicInfo } from "@/apps/team-os/features/crm/components/CustomerBasicInfo";
import { CustomerDetailHeader } from "@/apps/team-os/features/crm/components/CustomerDetailHeader";
import { CustomerFollowUpForm } from "@/apps/team-os/features/crm/components/CustomerFollowUpForm";
import { CustomerFollowUpSuggestion } from "@/apps/team-os/features/crm/components/CustomerFollowUpSuggestion";
import { CustomerFollowUpTimeline } from "@/apps/team-os/features/crm/components/CustomerFollowUpTimeline";
import { CrmEmptyState, CrmErrorState, CrmLoadingState } from "@/apps/team-os/features/crm/components/CrmState";
import { crmScopeQuery } from "@/apps/team-os/features/crm/components/crm-ui";
import { useCustomerDetail } from "@/apps/team-os/features/crm/hooks/useCustomerDetail";
import type { AnalyzeCustomerResult, CustomerFollowUpRecord, CustomerLevel, CustomerStage } from "@/apps/team-os/features/crm/types";

export function CustomerDetailPage({ customerId, returnCompanyId, returnTeamId, returnStage, returnLevel, returnTag }: { customerId: string; returnCompanyId?: string; returnTeamId?: string; returnStage?: CustomerStage; returnLevel?: CustomerLevel; returnTag?: string }) {
  const { data, loading, error, reload } = useCustomerDetail(customerId);
  const [followUpSuccess, setFollowUpSuccess] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<AnalyzeCustomerResult | null>(null);
  const scope = crmScopeQuery(returnCompanyId, returnTeamId, {
    stage: returnStage,
    level: returnLevel,
    tag: returnTag
  });
  const backHref = scope ? `/team-os/crm?${scope}` : "/team-os/crm";

  async function handleFollowUpCreated(_record: CustomerFollowUpRecord) {
    setFollowUpSuccess(true);
    setAnalysisResult(null);
    await reload();
  }

  async function handleAnalyzed(result: AnalyzeCustomerResult) {
    setFollowUpSuccess(false);
    setAnalysisResult(result);
    await reload();
  }

  if (loading) return <div className="mx-auto max-w-6xl"><CrmLoadingState label="正在读取客户详情…" /></div>;
  if (error) return <div className="mx-auto max-w-3xl"><CrmErrorState message={error} onRetry={() => void reload()} /></div>;
  if (!data) return <div className="mx-auto max-w-3xl"><CrmEmptyState title="客户不存在或不可访问" description="请返回客户列表确认当前账号权限。" /></div>;

  const latestFollowUpAt = data.followUps.reduce<number | null>((latest, item) => {
    const timestamp = new Date(item.createdAt).getTime();
    return latest === null || timestamp > latest ? timestamp : latest;
  }, null);
  const profileUpdatedAt = data.aiProfile ? new Date(data.aiProfile.updatedAt).getTime() : null;
  const profileStale = Boolean(latestFollowUpAt !== null && profileUpdatedAt !== null && latestFollowUpAt > profileUpdatedAt);
  const latestFollowUp = data.followUps[0];
  const persistedSuggestion = latestFollowUp?.aiSuggestion && latestFollowUp.aiRecommendedScript
    ? {
        suggestion: latestFollowUp.aiSuggestion,
        recommendedScript: latestFollowUp.aiRecommendedScript
      }
    : null;
  const visibleSuggestion = analysisResult?.suggestion ?? persistedSuggestion;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CustomerDetailHeader customer={data.customer} backHref={backHref} />
      <CustomerBasicInfo customer={data.customer} />
      {followUpSuccess ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />跟进记录已保存，可重新运行 AI 分析更新客户画像。</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="order-2 space-y-6 lg:order-1">
          {data.permissions.canAddFollowUp ? <CustomerFollowUpForm customerId={data.customer.id} onCreated={handleFollowUpCreated} /> : <Card><CardContent className="flex items-start gap-3 p-5 text-sm text-slate-600"><ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />当前账号只能查看客户资料，不能新增跟进记录。</CardContent></Card>}
          <CustomerFollowUpTimeline items={data.followUps} truncated={data.followUpsTruncated} />
        </div>

        <aside className="order-1 space-y-6 self-start lg:order-2 lg:sticky lg:top-6">
          <CustomerAIProfileCard profile={data.aiProfile} stale={profileStale} />
          {visibleSuggestion ? <CustomerFollowUpSuggestion value={visibleSuggestion} /> : null}
          {data.permissions.canAnalyze ? <CustomerAnalysisPanel customerId={data.customer.id} onAnalyzed={handleAnalyzed} /> : <Card><CardContent className="flex items-start gap-3 p-5 text-sm leading-6 text-slate-600"><ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />请先保存至少一条客户跟进记录，再运行 AI 客户分析。</CardContent></Card>}
        </aside>
      </div>
    </div>
  );
}
