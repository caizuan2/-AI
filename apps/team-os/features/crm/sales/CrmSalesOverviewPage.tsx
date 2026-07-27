"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  FileSignature,
  RefreshCw,
  Target,
  TriangleAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmSalesNavigation } from "@/apps/team-os/features/crm/sales/CrmSalesNavigation";
import { fetchCrmSalesDashboard } from "@/apps/team-os/features/crm/sales/client";
import type { CrmDashboardData } from "@/apps/team-os/features/crm/sales/types";
import {
  CRM_OPPORTUNITY_STAGE_LABELS,
  formatCrmMoney
} from "@/apps/team-os/features/crm/sales/ui";

const phases = [
  { href: "/team-os/crm/leads", title: "线索池", description: "录入、分配、判定与转客户", icon: Target, key: "leads" },
  { href: "/team-os/crm/opportunities", title: "商机漏斗", description: "从需求发现推进到赢单", icon: BriefcaseBusiness, key: "opportunities" },
  { href: "/team-os/crm/contracts", title: "合同台账", description: "签约、生效与履约状态", icon: FileSignature, key: "contracts" },
  { href: "/team-os/crm/receivables", title: "回款计划", description: "应收、实收与逾期风险", icon: Banknote, key: "receivables" }
] as const;

export function CrmSalesOverviewPage() {
  const [data, setData] = React.useState<CrmDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCrmSalesDashboard());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CRM 战情数据加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const metrics = data ? {
    leads: { value: String(data.leads.total), hint: `${data.leads.byStatus.QUALIFIED} 条可转客户` },
    opportunities: { value: formatCrmMoney(data.opportunities.openAmount), hint: `${data.opportunities.total} 个商机` },
    contracts: { value: formatCrmMoney(data.contracts.activeAmount), hint: `${data.contracts.total} 份合同` },
    receivables: { value: formatCrmMoney(data.receivables.outstandingAmount), hint: `逾期 ${formatCrmMoney(data.receivables.overdueAmount)}` }
  } : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmSalesNavigation />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">AI CRM 销售运营闭环</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">CRM 战情工作台</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">围绕线索、客户、商机、合同和回款形成一条可追踪、可审计的销售主链路。</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</Button>
      </div>

      {loading ? <Card><CardContent className="p-8 text-center text-sm text-slate-500" role="status">正在汇总销售数据…</CardContent></Card> : null}
      {error ? <Card className="border-rose-200"><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><TriangleAlert className="h-8 w-8 text-rose-500" aria-hidden="true" /><p className="text-sm text-rose-800" role="alert">{error}</p><Button variant="outline" onClick={() => void load()}>重新加载</Button></CardContent></Card> : null}

      {!loading && data && metrics ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {phases.map((phase) => {
              const Icon = phase.icon;
              const metric = metrics[phase.key];
              return (
                <Card key={phase.href}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3"><Icon className="h-5 w-5 text-indigo-700" aria-hidden="true" /><span className="text-xs text-slate-500">{metric.hint}</span></div>
                    <CardTitle className="pt-3 text-2xl">{metric.value}</CardTitle>
                    <CardDescription>{phase.title} · {phase.description}</CardDescription>
                  </CardHeader>
                  <CardContent><Link href={phase.href} className="focus-ring inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900">进入处理<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>商机阶段分布</CardTitle><CardDescription>金额为各阶段商机总额。</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(data.opportunities.byStage).map(([stage, value]) => (
                  <div key={stage} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="text-slate-600">{CRM_OPPORTUNITY_STAGE_LABELS[stage as keyof typeof CRM_OPPORTUNITY_STAGE_LABELS]}</span><span className="font-semibold text-slate-900">{value.count} 个 · {formatCrmMoney(value.amount)}</span></div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>回款健康度</CardTitle><CardDescription>实时汇总当前权限范围内的合同应收。</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">累计实收</p><p className="mt-2 text-xl font-semibold text-emerald-900">{formatCrmMoney(data.receivables.receivedAmount)}</p></div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">待收余额</p><p className="mt-2 text-xl font-semibold text-amber-900">{formatCrmMoney(data.receivables.outstandingAmount)}</p></div>
                <div className="rounded-xl bg-rose-50 p-4 sm:col-span-2"><p className="text-xs text-rose-700">逾期风险</p><p className="mt-2 text-xl font-semibold text-rose-900">{formatCrmMoney(data.receivables.overdueAmount)}</p></div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
