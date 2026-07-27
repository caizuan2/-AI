"use client";

import * as React from "react";
import { Banknote, CheckCircle2, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCrmReceivable,
  fetchCrmContracts,
  fetchCrmReceivables,
  recordCrmPayment
} from "@/apps/team-os/features/crm/sales/client";
import { CrmSalesPageHeader } from "@/apps/team-os/features/crm/sales/CrmSalesPageHeader";
import {
  CRM_RECEIVABLE_STATUSES,
  type CrmContractRecord,
  type CrmReceivableRecord
} from "@/apps/team-os/features/crm/sales/types";
import {
  CRM_RECEIVABLE_STATUS_LABELS,
  formatCrmMoney,
  formatCrmSalesDate
} from "@/apps/team-os/features/crm/sales/ui";
import { useCrmSalesReferenceData } from "@/apps/team-os/features/crm/sales/useCrmSalesReferenceData";

function PaymentForm({
  item,
  busy,
  onSubmit
}: {
  item: CrmReceivableRecord;
  busy: boolean;
  onSubmit: (item: CrmReceivableRecord, amount: string) => void | Promise<void>;
}) {
  const [amount, setAmount] = React.useState(item.outstandingAmount);
  return (
    <form
      className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-end"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(item, amount);
      }}
    >
      <label className="space-y-1 text-xs font-medium text-slate-600">本次回款金额<Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" max={item.outstandingAmount} step="0.01" required className="sm:w-44" /></label>
      <Button type="submit" size="sm" disabled={busy}>登记回款</Button>
    </form>
  );
}

export function CrmReceivablesPage() {
  const references = useCrmSalesReferenceData();
  const [items, setItems] = React.useState<CrmReceivableRecord[]>([]);
  const [contracts, setContracts] = React.useState<CrmContractRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [receivables, contractResult] = await Promise.all([
        fetchCrmReceivables({
          q: query.trim() || undefined,
          status: status || undefined,
          overdueOnly: overdueOnly || undefined,
          limit: 50
        }),
        fetchCrmContracts({ limit: 50 })
      ]);
      setItems(receivables.items);
      setTotal(receivables.total);
      setContracts(contractResult.items.filter((contract) => contract.status !== "CANCELLED"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回款计划加载失败。");
    } finally {
      setLoading(false);
    }
  }, [overdueOnly, query, status]);

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
      await createCrmReceivable({
        customerId: String(form.get("customerId") || ""),
        contractId: String(form.get("contractId") || ""),
        installmentNo: Number(form.get("installmentNo") || 1),
        amount: String(form.get("amount") || ""),
        dueDate: String(form.get("dueDate") || ""),
        reminderAt: String(form.get("reminderAt") || "") || undefined,
        notes: String(form.get("notes") || "")
      });
      formElement.reset();
      setSelectedCustomerId("");
      setShowForm(false);
      setSuccess("应收计划已创建，逾期状态将按到期日自动判定。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "应收计划创建失败。");
    } finally {
      setBusyId("");
    }
  }

  async function handlePayment(item: CrmReceivableRecord, amount: string) {
    setBusyId(item.id);
    setError("");
    setSuccess("");
    try {
      await recordCrmPayment(item.id, {
        amount,
        receivedAt: new Date().toISOString(),
        notes: "CRM 回款台账手动登记"
      });
      setSuccess(`合同 ${item.contract.contractNo} 已登记回款 ${formatCrmMoney(amount)}。`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回款登记失败。");
    } finally {
      setBusyId("");
    }
  }

  const customerContracts = contracts.filter((contract) => contract.customer.id === selectedCustomerId);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmSalesPageHeader
        eyebrow="合同 → 回款"
        title="回款计划与风险"
        description="按合同拆分应收期次，登记实际回款，并对逾期余额进行风险提示；应收总额不能超过合同金额。"
        action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />新增应收</Button>}
      />

      {references.error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{references.error}</p> : null}
      {error ? <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><TriangleAlert className="h-4 w-4" />{error}</p> : null}
      {success ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{success}</p> : null}

      {showForm ? (
        <Card>
          <CardHeader><CardTitle>新增应收计划</CardTitle><CardDescription>请选择同一客户的有效合同；服务端会校验期次唯一性与合同剩余可排金额。</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
              <label className="space-y-2 text-sm font-medium text-slate-700">所属团队<select value={references.selectedTeamId ?? ""} onChange={(event) => void references.selectTeam(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">选择团队</option>{references.context?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">关联客户<select name="customerId" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择客户</option>{references.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">关联合同<select name="contractId" className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择合同</option>{customerContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNo} · {contract.title} · {formatCrmMoney(contract.amount)}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">回款期次<Input name="installmentNo" type="number" min={1} defaultValue={1} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">应收金额<Input name="amount" type="number" min="0.01" step="0.01" required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">到期日期<Input name="dueDate" type="date" required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">提醒时间<Input name="reminderAt" type="datetime-local" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">备注<Textarea name="notes" rows={3} maxLength={5000} /></label>
              <div className="flex justify-end gap-3 md:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)}>取消</Button><Button type="submit" disabled={busyId === "create" || references.loading || customerContracts.length === 0}>{busyId === "create" ? "创建中…" : "创建应收计划"}</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card><CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索合同或客户" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="focus-ring h-11 rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部状态</option>{CRM_RECEIVABLE_STATUSES.map((value) => <option key={value} value={value}>{CRM_RECEIVABLE_STATUS_LABELS[value]}</option>)}</select><label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-slate-700"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />仅看逾期</label><Button variant="outline" onClick={() => { const next = searchInput.trim(); if (next === query) void load(); else setQuery(next); }} disabled={loading}><RefreshCw className="h-4 w-4" />查询</Button></CardContent></Card>

      {loading ? <Card><CardContent className="p-8 text-center text-sm text-slate-500" role="status">正在加载回款计划…</CardContent></Card> : null}
      {!loading && items.length === 0 ? <Card><CardContent className="p-10 text-center"><Banknote className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-slate-800">暂无应收计划</p><p className="mt-1 text-sm text-slate-500">合同确认后，按约定创建回款期次。</p></CardContent></Card> : null}
      {!loading && items.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">共 {total} 条应收记录</p>
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className={item.status === "OVERDUE" ? "border-rose-200" : undefined}>
                <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{item.customer.name} · 第 {item.installmentNo} 期</CardTitle><CardDescription>{item.contract.contractNo} · {item.contract.title}</CardDescription></div><Badge variant={item.status === "OVERDUE" ? "warning" : "default"}>{CRM_RECEIVABLE_STATUS_LABELS[item.status]}</Badge></div></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><p>应收：<span className="font-semibold text-slate-900">{formatCrmMoney(item.amount)}</span></p><p>已收：<span className="font-semibold text-emerald-700">{formatCrmMoney(item.receivedAmount)}</span></p><p>待收：<span className="font-semibold text-amber-700">{formatCrmMoney(item.outstandingAmount)}</span></p><p>到期：{formatCrmSalesDate(item.dueDate)}</p></div>
                  {!["PAID", "CANCELLED"].includes(item.status) ? <PaymentForm item={item} busy={busyId === item.id} onSubmit={handlePayment} /> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
