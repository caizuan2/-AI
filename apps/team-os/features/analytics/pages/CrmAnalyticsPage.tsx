"use client";

import * as React from "react";
import { AlertTriangle, BadgeDollarSign, Target, UsersRound } from "lucide-react";
import { AnalyticsBarList, AnalyticsFunnel } from "@/apps/team-os/features/analytics/components/AnalyticsCharts";
import { AnalyticsMetricCard } from "@/apps/team-os/features/analytics/components/AnalyticsMetricCard";
import { AnalyticsPageHeader } from "@/apps/team-os/features/analytics/components/AnalyticsPageHeader";
import { AnalyticsScopeSelector } from "@/apps/team-os/features/analytics/components/AnalyticsScopeSelector";
import { AnalyticsSectionNavigation } from "@/apps/team-os/features/analytics/components/AnalyticsSectionNavigation";
import { AnalyticsCoverageNotice, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsForbiddenState, AnalyticsLoadingState } from "@/apps/team-os/features/analytics/components/AnalyticsState";
import { useCrmAnalytics } from "@/apps/team-os/features/analytics/hooks/useAnalyticsData";
import type { AnalyticsRangeDays } from "@/apps/team-os/features/analytics/types";

export function CrmAnalyticsPage() {
  const [companyId, setCompanyId] = React.useState<string>();
  const [days, setDays] = React.useState<AnalyticsRangeDays>(30);
  const analytics = useCrmAnalytics(companyId, days);
  const data = analytics.data;
  const forbidden = analytics.error?.code === "FORBIDDEN";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AnalyticsPageHeader eyebrow="CRM Analytics" title="CRM 数据分析" description="从授权客户池中查看阶段分布、成交漏斗、高价值客户与风险客户规模，不读取跟进原文。" />
      {analytics.loading ? <AnalyticsLoadingState label="正在汇总客户经营指标…" /> : forbidden ? <AnalyticsForbiddenState description="CRM 分析仅向企业负责人和具备对应团队管理权限的主管开放。" /> : analytics.error && !data ? <AnalyticsErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} /> : !data ? <AnalyticsEmptyState title="CRM 分析暂不可用" description="请确认当前账号拥有可查看的客户数据范围。" /> : !data.context.permissions.canViewCrmAnalytics ? <AnalyticsForbiddenState description="当前角色没有 CRM 聚合数据查看权限。" /> : (
        <>
          <AnalyticsSectionNavigation permissions={data.context.permissions} />
          <AnalyticsScopeSelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} scopeMode={data.context.scopeMode} days={data.range.days} onCompanyChange={setCompanyId} onDaysChange={setDays} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsMetricCard label="客户数量" value={data.customerCount} icon={UsersRound} description="当前权限范围内的客户总数" accent="indigo" />
            <AnalyticsMetricCard label="当前成交占比" value={data.conversionRate} unit="PERCENT" icon={Target} description="当前阶段为已成交的客户占客户池比例，不代表历史转化率" accent="emerald" />
            <AnalyticsMetricCard label="高价值客户" value={data.highValueCustomerCount} icon={BadgeDollarSign} description="客户等级为高价值的数量" accent="amber" />
            <AnalyticsMetricCard label="风险客户" value={data.riskCustomerCount} icon={AlertTriangle} description="AI 客户画像识别为高风险的数量" accent="rose" />
          </div>

          {data.customerCount === 0 ? <AnalyticsEmptyState title="当前范围暂无客户" description="新增客户并更新阶段后，这里会形成 CRM 分析。" /> : (
            <div className="grid gap-6 xl:grid-cols-2">
              <AnalyticsBarList title="客户阶段分布" description="按客户当前阶段统计，数量为 0 仍保留为有效结果。" items={data.stageDistribution} />
              <AnalyticsFunnel items={data.funnel} />
              <AnalyticsBarList title="团队客户分布" description="仅展示当前账号有权管理团队的客户数量。" items={data.teamDistribution} />
            </div>
          )}
          <AnalyticsCoverageNotice coverage={data.dataCoverage} />
        </>
      )}
    </div>
  );
}
