"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Bot, GraduationCap, UsersRound, UserRoundCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TenantCompanySelector } from "@/apps/team-os/features/tenant/components/TenantCompanySelector";
import { TenantPageHeader } from "@/apps/team-os/features/tenant/components/TenantPageHeader";
import { TenantSectionNavigation } from "@/apps/team-os/features/tenant/components/TenantSectionNavigation";
import {
  TenantErrorState,
  TenantForbiddenState,
  TenantLoadingState
} from "@/apps/team-os/features/tenant/components/TenantState";
import { UsageMetricCard } from "@/apps/team-os/features/tenant/components/UsageMetricCard";
import { useTenantUsage } from "@/apps/team-os/features/tenant/hooks/useTenantData";
import type { TenantUsageMetric } from "@/apps/team-os/features/tenant/types";
import { formatTenantCount, formatTenantDate, tenantUsagePercent } from "@/apps/team-os/features/tenant/utils/tenant-format";

function metricDisplay(metric: TenantUsageMetric) {
  return formatTenantCount(metric.value, metric.unit && metric.unit !== "COUNT" ? metric.unit : "");
}

function limitDisplay(metric: TenantUsageMetric) {
  if (metric.limit === null || metric.limit === undefined) return null;
  const unit = metric.unit && metric.unit !== "COUNT" ? ` ${metric.unit}` : "";
  return `套餐上限：${formatTenantCount(metric.limit)}${unit}`;
}

export function UsageCenterPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useTenantUsage(initialCompanyId);
  const data = resource.data;
  const activeCompanyId = resource.companyId ?? data?.context.companyId;

  const handleCompanyChange = React.useCallback((companyId: string) => {
    resource.selectCompany(companyId);
    router.replace(`/team-os/usage?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TenantPageHeader
        eyebrow="Usage Center"
        title="使用量中心"
        description="按企业边界统计可可靠归因的成员、CRM 与培训使用量。无法准确归因的指标会保持不可用，不用推测值替代。"
      />
      <TenantSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <TenantLoadingState label="正在汇总企业使用量…" /> : resource.error?.code === "FORBIDDEN" ? (
        <TenantForbiddenState description="只有企业负责人可以查看企业级配额与使用量。" />
      ) : resource.error ? (
        <TenantErrorState message={resource.error.message} onRetry={() => void resource.reload()} />
      ) : data ? (
        <>
          <TenantCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} onChange={handleCompanyChange} />
          {data.context.companies.find((company) => company.id === data.context.companyId)?.status === "UNPROVISIONED" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="note">
              <p className="font-semibold">企业商业化资料待初始化</p>
              <p className="mt-1">以下仅展示可按企业安全归因的运营统计；套餐额度在商业化资料和订阅初始化前不会生效。</p>
            </div>
          ) : null}
          <Card className="border-slate-200 bg-slate-950 text-white">
            <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs text-slate-400">当前统计周期</p><p className="mt-1 font-semibold">{data.period.label}</p></div>
              <p className="text-xs text-slate-400">{formatTenantDate(data.period.startDate)} 至 {formatTenantDate(data.period.endDate)}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <UsageMetricCard label="企业用户数" displayValue={metricDisplay(data.metrics.users)} available={data.metrics.users.available} definition={data.metrics.users.definition} usagePercent={tenantUsagePercent(data.metrics.users.value, data.metrics.users.limit)} limitLabel={limitDisplay(data.metrics.users)} icon={UserRoundCheck} accent="indigo" />
            <UsageMetricCard label="AI 调用次数" displayValue={metricDisplay(data.metrics.aiCalls)} available={data.metrics.aiCalls.available} unavailableLabel="暂无采集" definition={data.metrics.aiCalls.definition} usagePercent={tenantUsagePercent(data.metrics.aiCalls.value, data.metrics.aiCalls.limit)} limitLabel={limitDisplay(data.metrics.aiCalls)} icon={Bot} accent="violet" />
            <UsageMetricCard label="知识库使用量" displayValue={metricDisplay(data.metrics.knowledgeItems)} available={data.metrics.knowledgeItems.available} unavailableLabel="不可用" definition={data.metrics.knowledgeItems.definition} usagePercent={tenantUsagePercent(data.metrics.knowledgeItems.value, data.metrics.knowledgeItems.limit)} limitLabel={limitDisplay(data.metrics.knowledgeItems)} icon={BookOpenCheck} accent="sky" />
            <UsageMetricCard label="CRM 客户数" displayValue={metricDisplay(data.metrics.crmCustomers)} available={data.metrics.crmCustomers.available} definition={data.metrics.crmCustomers.definition} usagePercent={tenantUsagePercent(data.metrics.crmCustomers.value, data.metrics.crmCustomers.limit)} limitLabel={limitDisplay(data.metrics.crmCustomers)} icon={UsersRound} accent="emerald" />
            <UsageMetricCard label="培训安排数" displayValue={metricDisplay(data.metrics.trainingAssignments)} available={data.metrics.trainingAssignments.available} definition={data.metrics.trainingAssignments.definition} usagePercent={tenantUsagePercent(data.metrics.trainingAssignments.value, data.metrics.trainingAssignments.limit)} limitLabel={limitDisplay(data.metrics.trainingAssignments)} icon={GraduationCap} accent="amber" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500" role="note">
            <p className="font-semibold text-slate-700">统计口径说明</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>企业用户按有效团队成员去重，避免同一员工加入多个团队后重复计费。</li>
              <li>CRM 客户按 Customer.companyId 精确统计；培训按未取消的企业培训安排统计。</li>
              <li>Team OS 当前没有覆盖全部 Provider 的企业调用账本，因此 AI 调用次数不会用 AI 产出记录冒充。</li>
              <li>知识库仅在企业 ID 能与既有 Tenant 安全映射时统计；无法映射时明确显示不可用。</li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
