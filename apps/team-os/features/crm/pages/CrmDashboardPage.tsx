"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCustomerForm } from "@/apps/team-os/features/crm/components/CreateCustomerForm";
import { CrmCompanySelector } from "@/apps/team-os/features/crm/components/CrmCompanySelector";
import { CrmEmptyState, CrmErrorState, CrmLoadingState } from "@/apps/team-os/features/crm/components/CrmState";
import { CustomerFilterBar } from "@/apps/team-os/features/crm/components/CustomerFilterBar";
import { CustomerList } from "@/apps/team-os/features/crm/components/CustomerList";
import { useCustomers, type CrmListFilterState } from "@/apps/team-os/features/crm/hooks/useCustomers";
import type { CustomerLevel, CustomerStage } from "@/apps/team-os/features/crm/types";

function routeKey(filters: CrmListFilterState) {
  return JSON.stringify({ companyId: filters.companyId, teamId: filters.teamId, stage: filters.stage, level: filters.level, tag: filters.tag });
}

export function CrmDashboardPage({ initialFilters }: { initialFilters: CrmListFilterState }) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<CrmListFilterState>(initialFilters);
  const [searchInput, setSearchInput] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createdCustomerId, setCreatedCustomerId] = React.useState<string | null>(null);
  const initialKey = routeKey(initialFilters);
  const initialKeyRef = React.useRef(initialKey);

  React.useEffect(() => {
    if (initialKeyRef.current !== initialKey) {
      initialKeyRef.current = initialKey;
      setCreating(false);
      setCreatedCustomerId(null);
      setSearchInput("");
      setFilters(initialFilters);
    }
  }, [initialFilters, initialKey]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((current) => current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const { data, loading, loadingMore, error, reload, loadMore } = useCustomers(filters);
  const context = data?.context;
  const activeCompanyId = filters.companyId ?? context?.companyId;
  const activeTeamId = filters.teamId ?? context?.selectedTeamId;
  const selectedTeam = context?.teams.find((team) => team.id === activeTeamId);

  function replaceRoute(next: CrmListFilterState) {
    initialKeyRef.current = routeKey(next);
    const query = new URLSearchParams();
    if (next.companyId) query.set("companyId", next.companyId);
    if (next.teamId) query.set("teamId", next.teamId);
    if (next.stage) query.set("stage", next.stage);
    if (next.level) query.set("level", next.level);
    if (next.tag) query.set("tag", next.tag);
    const value = query.toString();
    router.replace(value ? `/team-os/crm?${value}` : "/team-os/crm", { scroll: false });
  }

  function updateFilter(patch: Partial<CrmListFilterState>) {
    setCreatedCustomerId(null);
    const next = { ...filters, ...patch };
    setFilters(next);
    replaceRoute(next);
  }

  function handleCompanyChange(companyId: string) {
    setCreating(false);
    setCreatedCustomerId(null);
    setSearchInput("");
    const next: CrmListFilterState = { companyId, stage: filters.stage, level: filters.level };
    setFilters(next);
    replaceRoute(next);
  }

  function handleClear() {
    setSearchInput("");
    const next: CrmListFilterState = { companyId: activeCompanyId, teamId: activeTeamId };
    setFilters(next);
    replaceRoute(next);
  }

  async function handleCreated(result: { customerId: string }) {
    setCreating(false);
    setCreatedCustomerId(result.customerId);
    await reload();
  }

  const hasFilters = Boolean(filters.search || filters.stage || filters.level || filters.tag);
  const detailScope = new URLSearchParams();
  if (activeCompanyId) detailScope.set("companyId", activeCompanyId);
  if (activeTeamId) detailScope.set("teamId", activeTeamId);
  if (filters.stage) detailScope.set("stage", filters.stage);
  if (filters.level) detailScope.set("level", filters.level);
  if (filters.tag) detailScope.set("tag", filters.tag);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">AI CRM 客户智能管理系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">客户管理中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">管理客户资料与跟进记录，并用企业知识和 AI Coach 生成客户画像与下一步建议。</p></div>
        {context?.canCreateCustomer && !loading && !creating ? <Button onClick={() => { setCreatedCustomerId(null); setCreating(true); }}><Plus className="h-4 w-4" />新增客户</Button> : null}
      </div>

      {context ? <CrmCompanySelector companyId={activeCompanyId ?? null} companyName={context.companyName} companies={context.companies} disabled={loading || creating} onChange={handleCompanyChange} /> : null}

      {createdCustomerId ? <p className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />客户已创建并进入客户池。<Link href={`/team-os/crm/customer/${encodeURIComponent(createdCustomerId)}${detailScope.size ? `?${detailScope.toString()}` : ""}`} className="font-semibold underline underline-offset-2">查看客户</Link></p> : null}

      {!loading && creating && context?.canCreateCustomer && selectedTeam ? <CreateCustomerForm teamId={selectedTeam.id} teamName={selectedTeam.name} ownerOptions={context.ownerOptions} onCreated={handleCreated} onCancel={() => setCreating(false)} /> : null}

      {loading ? <CrmLoadingState /> : error && !data ? <CrmErrorState message={error} onRetry={() => void reload()} /> : !data || !context ? (
        <CrmEmptyState title="客户数据暂不可用" description="请稍后重试，或确认当前账号已加入有效企业团队。" />
      ) : (
        <>
          <CustomerFilterBar
            search={searchInput}
            teamId={activeTeamId}
            stage={filters.stage}
            level={filters.level}
            tag={filters.tag}
            teams={context.teams}
            tags={data.facets.tags}
            disabled={loading || creating}
            onSearchChange={setSearchInput}
            onTeamChange={(teamId) => updateFilter({ teamId, tag: undefined })}
            onStageChange={(stage: CustomerStage | undefined) => updateFilter({ stage })}
            onLevelChange={(level: CustomerLevel | undefined) => updateFilter({ level })}
            onTagChange={(tag) => updateFilter({ tag })}
            onClear={handleClear}
          />
          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error} <button type="button" className="font-semibold underline" onClick={() => void loadMore()}>重试</button></p> : null}
          {data.items.length === 0 ? (
            <CrmEmptyState
              title={hasFilters ? "没有符合条件的客户" : "当前客户池为空"}
              description={hasFilters ? "调整搜索词或筛选条件后重试。" : context.canCreateCustomer ? "创建首位客户，开始沉淀跟进记录与 AI 客户画像。" : "当前团队暂未分配可查看的客户。"}
              action={hasFilters ? <Button variant="outline" onClick={handleClear}>清除筛选</Button> : context.canCreateCustomer && !creating ? <Button onClick={() => setCreating(true)}>创建首位客户</Button> : undefined}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">共 {data.total} 位客户</p></div>
              <CustomerList items={data.items} detailQuery={detailScope.toString()} />
              {data.nextCursor ? <div className="flex justify-center"><Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "加载中…" : "加载更多"}</Button></div> : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
