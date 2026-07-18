"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, Scale, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IndustryAccessNotice } from "@/apps/team-os/features/industry-coach/components/IndustryAccessNotice";
import { IndustryCoachSectionNavigation } from "@/apps/team-os/features/industry-coach/components/IndustryCoachSectionNavigation";
import { IndustryCoachEmptyState, IndustryCoachErrorState, IndustryCoachLoadingState } from "@/apps/team-os/features/industry-coach/components/IndustryCoachState";
import { IndustryCoachSummary } from "@/apps/team-os/features/industry-coach/components/IndustryCoachSummary";
import { IndustryCompanySelector } from "@/apps/team-os/features/industry-coach/components/IndustryCompanySelector";
import { useIndustryCoachDashboard } from "@/apps/team-os/features/industry-coach/hooks/useIndustryCoachDashboard";

export function IndustryCoachDashboardPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useIndustryCoachDashboard(initialCompanyId);
  const context = data?.standards.context;
  const activeCompanyId = selectedCompanyId ?? context?.companyId ?? null;

  function handleCompanyChange(companyId: string) {
    selectCompany(companyId);
    router.replace(`/team-os/industry-coach?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-sm font-medium text-indigo-700">AI 行业教练知识融合系统</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">行业教练中心</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">将企业知识、行业 SOP 与五维评分规则注入员工沟通分析，生成更专业的成长建议。</p>
      </div>

      {context ? <IndustryCompanySelector companyId={activeCompanyId} companyName={context.companyName} companies={context.companies} disabled={loading} onChange={handleCompanyChange} /> : null}
      <IndustryCoachSectionNavigation companyId={activeCompanyId} />

      {loading ? <IndustryCoachLoadingState /> : error ? <IndustryCoachErrorState message={error} onRetry={() => void reload()} /> : !data || !context ? (
        <IndustryCoachEmptyState title="行业教练数据暂不可用" description="请稍后重试，或确认当前账号已加入有效企业。" />
      ) : !context.canViewCatalog ? (
        <>
          <IndustryAccessNotice canViewCatalog={context.canViewCatalog} canManage={context.canManage} />
          <IndustryCoachEmptyState
            title="企业目录由 AI 分析安全使用"
            description="员工无需直接读取企业标准；提交客户沟通记录时，系统会自动匹配您有权使用的行业知识。"
            action={<Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">前往沟通分析</Link>}
          />
        </>
      ) : (
        <>
          <IndustryAccessNotice canViewCatalog={context.canViewCatalog} canManage={context.canManage} />
          <IndustryCoachSummary standardCount={data.standards.total} activeStandardCount={data.standards.activeCount} ruleCount={data.rules.total} />

          <Card className="border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 text-white">
            <CardContent className="grid gap-6 p-7 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Sparkles className="h-5 w-5 text-indigo-200" aria-hidden="true" /></span>
                <h2 className="mt-5 text-2xl font-semibold">运行时知识融合</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200">AI Coach 会在分析时调用已有知识库服务并匹配启用标准，不复制 RAG，也不将配置表述为模型训练。</p>
              </div>
              <Link href="/team-os/ai-coach/analyze" className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-indigo-50">开始沟通分析<ArrowRight className="h-4 w-4" /></Link>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Link href={`/team-os/industry-coach/standards?companyId=${encodeURIComponent(context.companyId)}`} className="focus-ring block rounded-lg">
              <Card className="h-full transition hover:border-indigo-200 hover:shadow-md">
                <CardHeader><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><BookOpenCheck className="h-5 w-5" aria-hidden="true" /></span><CardTitle className="pt-3">行业标准库</CardTitle><CardDescription>管理销售 SOP、产品知识、标准话术与异议处理规范。</CardDescription></CardHeader>
              </Card>
            </Link>
            <Link href={`/team-os/industry-coach/rules?companyId=${encodeURIComponent(context.companyId)}`} className="focus-ring block rounded-lg">
              <Card className="h-full transition hover:border-indigo-200 hover:shadow-md">
                <CardHeader><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Scale className="h-5 w-5" aria-hidden="true" /></span><CardTitle className="pt-3">评分规则库</CardTitle><CardDescription>用五个固定维度定义企业自己的沟通评分依据。</CardDescription></CardHeader>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
