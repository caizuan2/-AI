"use client";

import * as React from "react";
import { CheckCircle2, FileSignature, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  changeCrmContractStatus,
  createCrmContract,
  fetchCrmContracts,
  fetchCrmOpportunities
} from "@/apps/team-os/features/crm/sales/client";
import { CrmSalesPageHeader } from "@/apps/team-os/features/crm/sales/CrmSalesPageHeader";
import {
  CRM_CONTRACT_STATUSES,
  type CrmContractRecord,
  type CrmContractStatus,
  type CrmOpportunityRecord
} from "@/apps/team-os/features/crm/sales/types";
import {
  CRM_CONTRACT_STATUS_LABELS,
  formatCrmMoney,
  formatCrmSalesDate
} from "@/apps/team-os/features/crm/sales/ui";
import { useCrmSalesReferenceData } from "@/apps/team-os/features/crm/sales/useCrmSalesReferenceData";

const CONTRACT_TRANSITIONS: Record<CrmContractStatus, readonly CrmContractStatus[]> = {
  DRAFT: ["APPROVING", "ACTIVE", "CANCELLED"],
  APPROVING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
};

export function CrmContractsPage() {
  const references = useCrmSalesReferenceData();
  const [items, setItems] = React.useState<CrmContractRecord[]>([]);
  const [opportunities, setOpportunities] = React.useState<CrmOpportunityRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [contracts, opportunityResult] = await Promise.all([
        fetchCrmContracts({ q: query.trim() || undefined, status: status || undefined, limit: 50 }),
        fetchCrmOpportunities({ limit: 50 })
      ]);
      setItems(contracts.items);
      setTotal(contracts.total);
      setOpportunities(opportunityResult.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "合同台账加载失败。");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyId("create");
    setError("");
    setSuccess("");
    try {
      await createCrmContract({
        customerId: String(form.get("customerId") || ""),
        opportunityId: String(form.get("opportunityId") || "") || undefined,
        contractNo: String(form.get("contractNo") || ""),
        title: String(form.get("title") || ""),
        amount: String(form.get("amount") || ""),
        signedAt: String(form.get("signedAt") || "") || undefined,
        startDate: String(form.get("startDate") || "") || undefined,
        endDate: String(form.get("endDate") || "") || undefined,
        fileUrls: [],
        notes: String(form.get("notes") || "")
      });
      formElement.reset();
      setSelectedCustomerId("");
      setShowForm(false);
      setSuccess("合同草稿已创建，可提交审批或直接生效。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "合同创建失败。");
    } finally {
      setBusyId("");
    }
  }

  const customerOpportunities = opportunities.filter(
    (opportunity) => opportunity.customer.id === selectedCustomerId
  );

  async function handleStatus(item: CrmContractRecord, next: CrmContractStatus) {
    setBusyId(item.id);
    setError("");
    setSuccess("");
    try {
      await changeCrmContractStatus(item.id, {
        status: next,
        reason: `销售合同台账手动变更为${CRM_CONTRACT_STATUS_LABELS[next]}`,
        ...(next === "ACTIVE" ? { signedAt: item.signedAt ?? new Date().toISOString() } : {})
      });
      setSuccess(`合同已更新为“${CRM_CONTRACT_STATUS_LABELS[next]}”。`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "合同状态更新失败。");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmSalesPageHeader
        eyebrow="商机 → 合同"
        title="合同台账"
        description="合同编号在企业内唯一；签约、生效、完成和取消均通过受控状态流转并写入审计记录。"
        action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />新建合同</Button>}
      />

      {references.error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{references.error}</p> : null}
      {error ? <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><TriangleAlert className="h-4 w-4" />{error}</p> : null}
      {success ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{success}</p> : null}

      {showForm ? (
        <Card>
          <CardHeader><CardTitle>新建销售合同</CardTitle><CardDescription>合同只能关联同一企业、同一客户的商机；服务端会再次校验企业范围与负责人。</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
              <label className="space-y-2 text-sm font-medium text-slate-700">所属团队<select value={references.selectedTeamId ?? ""} onChange={(event) => void references.selectTeam(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">选择团队</option>{references.context?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">关联客户<select name="customerId" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择客户</option>{references.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">关联合同商机<select name="opportunityId" className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">不关联商机</option>{customerOpportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">合同编号<Input name="contractNo" maxLength={120} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">合同标题<Input name="title" maxLength={200} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">合同金额<Input name="amount" type="number" min={0} step="0.01" required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">签约日期<Input name="signedAt" type="date" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">开始日期<Input name="startDate" type="date" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">结束日期<Input name="endDate" type="date" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">备注<Textarea name="notes" rows={4} maxLength={5000} /></label>
              <div className="flex justify-end gap-3 md:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)}>取消</Button><Button type="submit" disabled={busyId === "create" || references.loading || references.customers.length === 0}>{busyId === "create" ? "创建中…" : "创建合同"}</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索合同编号、标题或客户" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="focus-ring h-11 rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部状态</option>{CRM_CONTRACT_STATUSES.map((value) => <option key={value} value={value}>{CRM_CONTRACT_STATUS_LABELS[value]}</option>)}</select><Button variant="outline" onClick={() => { const next = searchInput.trim(); if (next === query) void load(); else setQuery(next); }} disabled={loading}><RefreshCw className="h-4 w-4" />查询</Button></CardContent></Card>

      {loading ? <Card><CardContent className="p-8 text-center text-sm text-slate-500" role="status">正在加载合同…</CardContent></Card> : null}
      {!loading && items.length === 0 ? <Card><CardContent className="p-10 text-center"><FileSignature className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-slate-800">暂无合同</p><p className="mt-1 text-sm text-slate-500">赢单商机确认后，在这里创建销售合同。</p></CardContent></Card> : null}
      {!loading && items.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">共 {total} 份合同</p>
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{item.title}</CardTitle><CardDescription>{item.contractNo} · {item.customer.name}</CardDescription></div><Badge>{CRM_CONTRACT_STATUS_LABELS[item.status]}</Badge></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><p>合同金额：<span className="font-semibold text-slate-900">{formatCrmMoney(item.amount)}</span></p><p>负责人：{item.owner.name}</p><p>签约：{formatCrmSalesDate(item.signedAt)}</p><p>期限：{formatCrmSalesDate(item.startDate)} 至 {formatCrmSalesDate(item.endDate)}</p></div>
                  {item.notes ? <p className="break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700 [overflow-wrap:anywhere]">{item.notes}</p> : null}
                  {CONTRACT_TRANSITIONS[item.status].length > 0 ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">{CONTRACT_TRANSITIONS[item.status].map((next) => <Button key={next} size="sm" variant={next === "ACTIVE" || next === "COMPLETED" ? "default" : "outline"} onClick={() => void handleStatus(item, next)} disabled={busyId === item.id}>{CRM_CONTRACT_STATUS_LABELS[next]}</Button>)}</div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
