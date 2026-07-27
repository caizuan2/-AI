"use client";

import * as React from "react";
import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, Columns3, List, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  changeCrmOpportunityStage,
  createCrmOpportunity,
  fetchCrmOpportunities
} from "@/apps/team-os/features/crm/sales/client";
import { CrmSalesPageHeader } from "@/apps/team-os/features/crm/sales/CrmSalesPageHeader";
import {
  CRM_OPPORTUNITY_STAGES,
  type CrmOpportunityRecord,
  type CrmOpportunityStage
} from "@/apps/team-os/features/crm/sales/types";
import {
  CRM_OPPORTUNITY_STAGE_LABELS,
  CRM_OPPORTUNITY_STATUS_LABELS,
  formatCrmMoney,
  formatCrmSalesDate
} from "@/apps/team-os/features/crm/sales/ui";
import { useCrmSalesReferenceData } from "@/apps/team-os/features/crm/sales/useCrmSalesReferenceData";

const NEXT_STAGE: Partial<Record<CrmOpportunityStage, CrmOpportunityStage>> = {
  DISCOVERY: "QUALIFICATION",
  QUALIFICATION: "SOLUTION",
  SOLUTION: "QUOTATION",
  QUOTATION: "NEGOTIATION",
  NEGOTIATION: "CONTRACT",
  CONTRACT: "WON"
};

export function CrmOpportunitiesPage({ pipeline = false }: { pipeline?: boolean }) {
  const references = useCrmSalesReferenceData();
  const [items, setItems] = React.useState<CrmOpportunityRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [stage, setStage] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchCrmOpportunities({
        q: query.trim() || undefined,
        stage: stage || undefined,
        limit: 50
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商机列表加载失败。");
    } finally {
      setLoading(false);
    }
  }, [query, stage]);

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
      await createCrmOpportunity({
        customerId: String(form.get("customerId") || ""),
        name: String(form.get("name") || ""),
        amount: String(form.get("amount") || ""),
        probability: Number(form.get("probability") || 0),
        expectedCloseDate: String(form.get("expectedCloseDate") || "") || undefined,
        nextAction: String(form.get("nextAction") || ""),
        competitors: String(form.get("competitors") || "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)
      });
      formElement.reset();
      setShowForm(false);
      setSuccess("商机已创建并进入需求发现阶段。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商机创建失败。");
    } finally {
      setBusyId("");
    }
  }

  async function handleStage(item: CrmOpportunityRecord, toStage: CrmOpportunityStage) {
    setBusyId(item.id);
    setError("");
    setSuccess("");
    try {
      await changeCrmOpportunityStage(item.id, {
        toStage,
        reason: toStage === "LOST" ? "销售人员在漏斗中标记输单" : "销售人员按 SOP 推进商机阶段",
        probability: toStage === "LOST" ? 0 : Math.max(item.probability, Math.min(95, item.probability + 15)),
        nextAction: toStage === "WON" ? "创建并生效销售合同" : item.nextAction
      });
      setSuccess(`商机已推进至“${CRM_OPPORTUNITY_STAGE_LABELS[toStage]}”。`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商机阶段推进失败。");
    } finally {
      setBusyId("");
    }
  }

  const cards = (records: CrmOpportunityRecord[]) => records.map((item) => {
    const next = NEXT_STAGE[item.stage];
    return (
      <Card key={item.id} className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><CardTitle className="break-words [overflow-wrap:anywhere]">{item.name}</CardTitle><CardDescription>{item.customer.name} · {item.owner.name}</CardDescription></div>
            <div className="flex flex-wrap gap-2"><Badge>{CRM_OPPORTUNITY_STAGE_LABELS[item.stage]}</Badge><Badge variant="outline">{CRM_OPPORTUNITY_STATUS_LABELS[item.status]}</Badge></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <p>金额：<span className="font-semibold text-slate-900">{formatCrmMoney(item.amount)}</span></p>
            <p>成交概率：{item.probability}%</p>
            <p>预计成交：{formatCrmSalesDate(item.expectedCloseDate)}</p>
            <p>团队：{item.team?.name ?? "未设置"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-500">下一步行动</p><p className="mt-1 break-words text-slate-700 [overflow-wrap:anywhere]">{item.nextAction || "未填写"}</p></div>
          {item.status === "OPEN" ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <Button size="sm" variant="outline" onClick={() => void handleStage(item, "LOST")} disabled={busyId === item.id}>标记输单</Button>
              {next ? <Button size="sm" onClick={() => void handleStage(item, next)} disabled={busyId === item.id}>推进到{CRM_OPPORTUNITY_STAGE_LABELS[next]}</Button> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmSalesPageHeader
        eyebrow="客户 → 商机"
        title={pipeline ? "销售漏斗" : "商机管理"}
        description="商机按照需求发现、资格确认、方案、报价、谈判、合同、赢单的顺序推进，并完整记录阶段事件。"
        action={<div className="flex gap-2"><Link href={pipeline ? "/team-os/crm/opportunities" : "/team-os/crm/opportunities/pipeline"} className="focus-ring inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{pipeline ? <List className="h-4 w-4" /> : <Columns3 className="h-4 w-4" />}{pipeline ? "列表视图" : "漏斗视图"}</Link><Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />新建商机</Button></div>}
      />

      {references.error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{references.error}</p> : null}
      {error ? <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><TriangleAlert className="h-4 w-4" />{error}</p> : null}
      {success ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{success}</p> : null}

      {showForm ? (
        <Card>
          <CardHeader><CardTitle>新建商机</CardTitle><CardDescription>商机必须关联当前权限范围内的客户，团队与负责人由服务端按客户归属校验。</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
              <label className="space-y-2 text-sm font-medium text-slate-700">所属团队<select value={references.selectedTeamId ?? ""} onChange={(event) => void references.selectTeam(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">选择团队</option>{references.context?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">关联客户<select name="customerId" className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择客户</option>{references.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">商机名称<Input name="name" maxLength={200} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">预计金额<Input name="amount" type="number" min={0} step="0.01" required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">成交概率<Input name="probability" type="number" min={0} max={100} defaultValue={20} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">预计成交日期<Input name="expectedCloseDate" type="date" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">竞争对手<Input name="competitors" placeholder="多个名称用逗号分隔" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">下一步行动<Textarea name="nextAction" rows={3} maxLength={2000} required /></label>
              <div className="flex justify-end gap-3 md:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)}>取消</Button><Button type="submit" disabled={busyId === "create" || references.loading || references.customers.length === 0}>{busyId === "create" ? "创建中…" : "创建商机"}</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {!pipeline ? <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索商机或客户" /><select value={stage} onChange={(event) => setStage(event.target.value)} className="focus-ring h-11 rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部阶段</option>{CRM_OPPORTUNITY_STAGES.map((value) => <option key={value} value={value}>{CRM_OPPORTUNITY_STAGE_LABELS[value]}</option>)}</select><Button variant="outline" onClick={() => { const next = searchInput.trim(); if (next === query) void load(); else setQuery(next); }} disabled={loading}><RefreshCw className="h-4 w-4" />查询</Button></CardContent></Card> : null}

      {loading ? <Card><CardContent className="p-8 text-center text-sm text-slate-500" role="status">正在加载商机…</CardContent></Card> : null}
      {!loading && items.length === 0 ? <Card><CardContent className="p-10 text-center"><BriefcaseBusiness className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-slate-800">暂无商机</p><p className="mt-1 text-sm text-slate-500">先将有效线索转为客户，再创建首个商机。</p></CardContent></Card> : null}
      {!loading && items.length > 0 && pipeline ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1680px] grid-cols-8 gap-4">
            {CRM_OPPORTUNITY_STAGES.map((value) => {
              const records = items.filter((item) => item.stage === value);
              return <section key={value} className="space-y-3"><div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"><span>{CRM_OPPORTUNITY_STAGE_LABELS[value]}</span><span>{records.length}</span></div>{cards(records)}</section>;
            })}
          </div>
        </div>
      ) : null}
      {!loading && items.length > 0 && !pipeline ? <div className="space-y-4"><p className="text-sm text-slate-500">共 {total} 个商机</p><div className="grid gap-4 xl:grid-cols-2">{cards(items)}</div></div> : null}
    </div>
  );
}
