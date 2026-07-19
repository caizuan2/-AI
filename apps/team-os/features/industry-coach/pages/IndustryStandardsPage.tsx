"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndustryAccessNotice } from "@/apps/team-os/features/industry-coach/components/IndustryAccessNotice";
import { IndustryCoachSectionNavigation } from "@/apps/team-os/features/industry-coach/components/IndustryCoachSectionNavigation";
import { IndustryCoachEmptyState, IndustryCoachErrorState, IndustryCoachLoadingState } from "@/apps/team-os/features/industry-coach/components/IndustryCoachState";
import { IndustryCompanySelector } from "@/apps/team-os/features/industry-coach/components/IndustryCompanySelector";
import { IndustryStandardForm } from "@/apps/team-os/features/industry-coach/components/IndustryStandardForm";
import { IndustryStandardList } from "@/apps/team-os/features/industry-coach/components/IndustryStandardList";
import { useIndustryStandards } from "@/apps/team-os/features/industry-coach/hooks/useIndustryStandards";

export function IndustryStandardsPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useIndustryStandards(initialCompanyId);
  const [creating, setCreating] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const context = data?.context;
  const activeCompanyId = selectedCompanyId ?? context?.companyId ?? null;

  function handleCompanyChange(companyId: string) {
    setCreating(false);
    setSuccess(null);
    selectCompany(companyId);
    router.replace(`/team-os/industry-coach/standards?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }

  async function handleCreated() {
    setCreating(false);
    setSuccess("行业标准已创建，并将在后续 AI 分析中按状态匹配使用。");
    await reload();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">AI 行业教练知识融合系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">行业标准库</h1><p className="mt-2 text-sm leading-6 text-slate-600">维护企业销售 SOP、产品标准、标准话术与异议处理规范。</p></div>
        {context?.canManage && !loading && !creating ? <Button onClick={() => { setSuccess(null); setCreating(true); }}><Plus className="h-4 w-4" />新增标准</Button> : null}
      </div>

      {context ? <IndustryCompanySelector companyId={activeCompanyId} companyName={context.companyName} companies={context.companies} disabled={loading || creating} onChange={handleCompanyChange} /> : null}
      <IndustryCoachSectionNavigation companyId={activeCompanyId} />
      {context ? <IndustryAccessNotice canViewCatalog={context.canViewCatalog} canManage={context.canManage} /> : null}
      {success ? <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{success}</p> : null}
      {!loading && creating && context?.canManage ? <IndustryStandardForm companyId={context.companyId} onCreated={handleCreated} onCancel={() => setCreating(false)} /> : null}

      {loading ? <IndustryCoachLoadingState label="正在加载行业标准…" /> : error ? <IndustryCoachErrorState message={error} onRetry={() => void reload()} /> : !data || !context ? (
        <IndustryCoachEmptyState title="行业标准暂不可用" description="请稍后重试，或确认当前账号已加入有效企业。" />
      ) : !context.canViewCatalog ? (
        <IndustryCoachEmptyState title="当前角色不直接展示企业标准" description="标准会在您提交 AI 沟通分析时按权限自动匹配，无需手动浏览。" action={<Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">前往沟通分析</Link>} />
      ) : data.items.length === 0 ? (
        <IndustryCoachEmptyState title="尚未配置行业标准" description={context.canManage ? "创建首项企业标准，让 AI Coach 能够对照真实业务规范进行分析。" : "企业负责人尚未配置可查看的行业标准。"} action={context.canManage && !creating ? <Button onClick={() => setCreating(true)}>创建首项标准</Button> : undefined} />
      ) : (
        <>
          {data.truncated ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">当前仅展示最近部分标准，共 {data.total} 项。</p> : null}
          <IndustryStandardList items={data.items} />
        </>
      )}
    </div>
  );
}
