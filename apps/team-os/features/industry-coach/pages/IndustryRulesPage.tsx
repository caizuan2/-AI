"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachRuleForm } from "@/apps/team-os/features/industry-coach/components/CoachRuleForm";
import { CoachRuleList } from "@/apps/team-os/features/industry-coach/components/CoachRuleList";
import { IndustryAccessNotice } from "@/apps/team-os/features/industry-coach/components/IndustryAccessNotice";
import { IndustryCoachSectionNavigation } from "@/apps/team-os/features/industry-coach/components/IndustryCoachSectionNavigation";
import { IndustryCoachEmptyState, IndustryCoachErrorState, IndustryCoachLoadingState } from "@/apps/team-os/features/industry-coach/components/IndustryCoachState";
import { IndustryCompanySelector } from "@/apps/team-os/features/industry-coach/components/IndustryCompanySelector";
import { useCoachRules } from "@/apps/team-os/features/industry-coach/hooks/useCoachRules";

export function IndustryRulesPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useCoachRules(initialCompanyId);
  const [creating, setCreating] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const context = data?.context;
  const activeCompanyId = selectedCompanyId ?? context?.companyId ?? null;

  function handleCompanyChange(companyId: string) {
    setCreating(false);
    setSuccess(null);
    selectCompany(companyId);
    router.replace(`/team-os/industry-coach/rules?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }

  async function handleCreated() {
    setCreating(false);
    setSuccess("评分规则已创建，五项销售能力均按 20 分权重保存。");
    await reload();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">AI 行业教练知识融合系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">评分规则库</h1><p className="mt-2 text-sm leading-6 text-slate-600">用五维、百分制评分标准统一企业沟通分析口径。</p></div>
        {context?.canManage && !loading && !creating ? <Button onClick={() => { setSuccess(null); setCreating(true); }}><Plus className="h-4 w-4" />新增规则</Button> : null}
      </div>

      {context ? <IndustryCompanySelector companyId={activeCompanyId} companyName={context.companyName} companies={context.companies} disabled={loading || creating} onChange={handleCompanyChange} /> : null}
      <IndustryCoachSectionNavigation companyId={activeCompanyId} />
      {context ? <IndustryAccessNotice canViewCatalog={context.canViewCatalog} canManage={context.canManage} /> : null}
      {success ? <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{success}</p> : null}
      {!loading && creating && context?.canManage ? <CoachRuleForm companyId={context.companyId} onCreated={handleCreated} onCancel={() => setCreating(false)} /> : null}

      {loading ? <IndustryCoachLoadingState label="正在加载评分规则…" /> : error ? <IndustryCoachErrorState message={error} onRetry={() => void reload()} /> : !data || !context ? (
        <IndustryCoachEmptyState title="评分规则暂不可用" description="请稍后重试，或确认当前账号已加入有效企业。" />
      ) : !context.canViewCatalog ? (
        <IndustryCoachEmptyState title="当前角色不直接展示评分规则" description="评分依据会在您提交 AI 沟通分析时按权限自动使用，无需手动浏览。" action={<Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">前往沟通分析</Link>} />
      ) : data.items.length === 0 ? (
        <IndustryCoachEmptyState title="尚未配置评分规则" description={context.canManage ? "创建首套五维评分规则，为行业分析提供统一判断依据。" : "企业负责人尚未配置可查看的评分规则。"} action={context.canManage && !creating ? <Button onClick={() => setCreating(true)}>创建首套规则</Button> : undefined} />
      ) : (
        <>
          {data.truncated ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">当前仅展示最近部分规则，共 {data.total} 套。</p> : null}
          <CoachRuleList items={data.items} />
        </>
      )}
    </div>
  );
}
