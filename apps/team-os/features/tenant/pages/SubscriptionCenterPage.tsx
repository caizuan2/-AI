"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, KeyRound, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantCompanySelector } from "@/apps/team-os/features/tenant/components/TenantCompanySelector";
import { TenantPageHeader } from "@/apps/team-os/features/tenant/components/TenantPageHeader";
import { TenantSectionNavigation } from "@/apps/team-os/features/tenant/components/TenantSectionNavigation";
import {
  TenantEmptyState,
  TenantErrorState,
  TenantForbiddenState,
  TenantLoadingState
} from "@/apps/team-os/features/tenant/components/TenantState";
import { useTenantSubscription } from "@/apps/team-os/features/tenant/hooks/useTenantData";
import { requestSubscriptionUpgrade, TenantClientError } from "@/apps/team-os/features/tenant/services/tenant-client";
import type { TenantPlanSummary, UpgradeIntentResult } from "@/apps/team-os/features/tenant/types";
import {
  formatTenantCount,
  formatTenantCurrency,
  formatTenantDate,
  tenantFeatureLabel,
  tenantStatusLabel
} from "@/apps/team-os/features/tenant/utils/tenant-format";

function PlanLimits({ plan }: { plan: TenantPlanSummary }) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">成员上限</p><p className="mt-1 font-semibold">{formatTenantCount(plan.maxUsers, "人")}</p></div>
      <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">存储上限</p><p className="mt-1 font-semibold">{formatTenantCount(plan.maxStorage, "MiB")}</p></div>
    </div>
  );
}

export function SubscriptionCenterPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useTenantSubscription(initialCompanyId);
  const [requestingPlanId, setRequestingPlanId] = React.useState<string | null>(null);
  const [upgradeResult, setUpgradeResult] = React.useState<UpgradeIntentResult | null>(null);
  const [upgradeError, setUpgradeError] = React.useState<string | null>(null);
  const upgradeRequestRef = React.useRef(0);
  const data = resource.data;
  const activeCompanyId = resource.companyId ?? data?.context.companyId;

  React.useEffect(() => {
    upgradeRequestRef.current += 1;
    setRequestingPlanId(null);
    setUpgradeResult(null);
    setUpgradeError(null);
  }, [initialCompanyId]);

  const handleCompanyChange = React.useCallback((companyId: string) => {
    upgradeRequestRef.current += 1;
    setRequestingPlanId(null);
    setUpgradeResult(null);
    setUpgradeError(null);
    resource.selectCompany(companyId);
    router.replace(`/team-os/subscription?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  async function handleUpgradeRequest(plan: TenantPlanSummary) {
    if (!data || requestingPlanId) return;
    const requestId = ++upgradeRequestRef.current;
    setRequestingPlanId(plan.id);
    setUpgradeResult(null);
    setUpgradeError(null);
    try {
      const result = await requestSubscriptionUpgrade({
        companyId: data.context.companyId,
        targetPlanId: plan.id
      });
      if (upgradeRequestRef.current === requestId) setUpgradeResult(result);
    } catch (error) {
      if (upgradeRequestRef.current === requestId) {
      setUpgradeError(error instanceof TenantClientError ? error.message : "授权要求检查失败，请稍后重试。");
      }
    } finally {
      if (upgradeRequestRef.current === requestId) setRequestingPlanId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TenantPageHeader
        eyebrow="Subscription Center"
        title="套餐中心"
        description="查看当前套餐、有效期和功能权限。套餐变更必须通过企业授权流程，本页面只检查授权要求，不会提交申请或直接开通付费能力。"
      />
      <TenantSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <TenantLoadingState label="正在读取套餐信息…" /> : resource.error?.code === "FORBIDDEN" ? (
        <TenantForbiddenState description="只有当前企业的有效成员可以查看套餐；升级授权要求仅限企业负责人检查。" />
      ) : resource.error ? (
        <TenantErrorState message={resource.error.message} onRetry={() => void resource.reload()} />
      ) : data ? (
        <>
          <TenantCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} disabled={Boolean(requestingPlanId)} onChange={handleCompanyChange} />

          {data.context.companies.find((company) => company.id === data.context.companyId)?.status === "UNPROVISIONED" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="note">
              <p className="font-semibold">企业商业化资料待初始化</p>
              <p className="mt-1">可先查看套餐目录和授权要求；本次检查不会留存申请、创建订阅或开通功能。</p>
            </div>
          ) : null}

          {data.subscription ? (
            <Card className="overflow-hidden border-indigo-200 bg-gradient-to-br from-slate-950 to-indigo-950 text-white shadow-xl shadow-indigo-100">
              <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white/10 text-indigo-100 ring-white/20">
                      {data.subscription.isEffective ? "当前套餐" : "最近订阅"}
                    </Badge>
                    <Badge className="bg-white/10 text-indigo-100 ring-white/20">{tenantStatusLabel(data.subscription.status)}</Badge>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold">{data.subscription.plan.name}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{data.subscription.plan.description}</p>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                    <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" aria-hidden="true" />{formatTenantDate(data.subscription.startDate)} 至 {formatTenantDate(data.subscription.endDate)}</span>
                    <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{data.subscription.isEffective ? "权限已生效" : "权限未生效"}</span>
                  </div>
                </div>
                <div className="min-w-48 rounded-2xl bg-white/10 p-5 text-center">
                  <p className="text-xs text-indigo-200">套餐价格</p>
                  <p className="mt-2 text-2xl font-semibold">{formatTenantCurrency(data.subscription.plan.price)}</p>
                  <p className="mt-1 text-xs text-slate-300">具体周期以授权协议为准</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <TenantEmptyState title="尚未开通有效套餐" description="当前企业没有可生效的套餐。请联系授权方完成企业授权后再使用受限功能。" />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>当前功能权限</CardTitle>
                <CardDescription>服务端根据企业状态、套餐有效期和功能开关共同判定。</CardDescription>
              </CardHeader>
              <CardContent>
                {data.featurePermissions.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {data.featurePermissions.map((permission) => (
                      <li key={permission.featureKey} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${permission.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                          {permission.enabled ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 break-words font-medium">{tenantFeatureLabel(permission.featureKey)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">当前没有已配置的功能权限。</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>授权兼容说明</CardTitle>
                <CardDescription>Phase 6 只建立安全兼容入口，不修改既有卡密系统。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                <p className="flex gap-3"><KeyRound className="mt-1 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />企业授权、套餐授权和功能授权将通过不透明、单次使用的授权凭证接入。</p>
                <p className="flex gap-3"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />当前升级入口仅返回“需要授权”，不会写入套餐、绕过付费或更改原卡密状态。</p>
              </CardContent>
            </Card>
          </div>

          {upgradeResult ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
              <p className="font-semibold">需要企业授权：{upgradeResult.targetPlan.name}</p>
              <p className="mt-1 leading-6">{upgradeResult.message}</p>
              <p className="mt-2 text-xs text-amber-700">未执行套餐变更（mutationApplied=false）。请联系授权方完成后续流程。</p>
            </div>
          ) : null}
          {upgradeError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{upgradeError}</div> : null}

          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950">可选套餐</h2>
              <p className="mt-1 text-sm text-slate-500">选择目标套餐后查看授权要求；系统不会提交申请或直接完成升级。</p>
            </div>
            {data.availablePlans.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {data.availablePlans.map((plan) => {
                  const current = data.subscription?.isEffective === true && data.subscription.plan.id === plan.id;
                  return (
                    <Card key={plan.id} className={current ? "border-indigo-300 ring-1 ring-indigo-100" : undefined}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><CardTitle className="break-words">{plan.name}</CardTitle><CardDescription>{plan.description}</CardDescription></div>
                          {current ? <Badge>当前</Badge> : null}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-2xl font-semibold text-slate-950">{formatTenantCurrency(plan.price)}</p>
                        <PlanLimits plan={plan} />
                        <ul className="space-y-2 text-sm text-slate-600">
                          {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><span className="break-words">{tenantFeatureLabel(feature)}</span></li>)}
                        </ul>
                        {!current && data.context.permissions.canRequestUpgrade ? (
                          <Button className="w-full" variant="outline" disabled={Boolean(requestingPlanId)} onClick={() => void handleUpgradeRequest(plan)}>
                            {requestingPlanId === plan.id ? "正在检查授权要求…" : "查看升级授权要求"}
                          </Button>
                        ) : current ? <p className="text-center text-xs font-medium text-indigo-700">当前正在使用</p> : <p className="text-center text-xs text-slate-500">仅企业负责人可检查</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : <TenantEmptyState title="暂无可选套餐" description="套餐目录尚未配置，请联系平台授权方。" />}
          </div>
        </>
      ) : null}
    </div>
  );
}
