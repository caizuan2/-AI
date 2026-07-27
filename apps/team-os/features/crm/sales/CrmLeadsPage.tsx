"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Plus, RefreshCw, Target, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  convertCrmLead,
  createCrmLead,
  fetchCrmLeads,
  updateCrmLead
} from "@/apps/team-os/features/crm/sales/client";
import { CrmSalesPageHeader } from "@/apps/team-os/features/crm/sales/CrmSalesPageHeader";
import {
  CRM_LEAD_SOURCES,
  CRM_LEAD_STATUSES,
  type CrmLeadRecord,
  type CrmLeadSource,
  type CrmLeadStatus
} from "@/apps/team-os/features/crm/sales/types";
import {
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_STATUS_LABELS,
  formatCrmMoney,
  formatCrmSalesDate
} from "@/apps/team-os/features/crm/sales/ui";
import { useCrmSalesReferenceData } from "@/apps/team-os/features/crm/sales/useCrmSalesReferenceData";

const LEAD_TRANSITIONS: Record<CrmLeadStatus, readonly CrmLeadStatus[]> = {
  NEW: ["UNASSIGNED", "ASSIGNED", "CONTACTED", "DISQUALIFIED", "RECYCLED"],
  UNASSIGNED: ["ASSIGNED", "DISQUALIFIED", "RECYCLED"],
  ASSIGNED: ["UNASSIGNED", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "RECYCLED"],
  CONTACTED: ["ASSIGNED", "QUALIFIED", "DISQUALIFIED", "RECYCLED"],
  QUALIFIED: ["CONTACTED", "ASSIGNED", "DISQUALIFIED", "RECYCLED"],
  CONVERTED: [],
  DISQUALIFIED: ["RECYCLED"],
  RECYCLED: ["UNASSIGNED", "ASSIGNED"]
};

function tags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function CrmLeadsPage() {
  const references = useCrmSalesReferenceData();
  const [items, setItems] = React.useState<CrmLeadRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchCrmLeads({
        q: query.trim() || undefined,
        status: status || undefined,
        limit: 50
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "线索列表加载失败。");
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
      await createCrmLead({
        teamId: String(form.get("teamId") || "") || undefined,
        ownerId: String(form.get("ownerId") || "") || undefined,
        name: String(form.get("name") || ""),
        companyName: String(form.get("companyName") || "") || undefined,
        contactName: String(form.get("contactName") || "") || undefined,
        phone: String(form.get("phone") || "") || undefined,
        email: String(form.get("email") || "") || undefined,
        wechat: String(form.get("wechat") || "") || undefined,
        industry: String(form.get("industry") || "") || undefined,
        source: String(form.get("source") || "MANUAL") as CrmLeadSource,
        sourceDetail: String(form.get("sourceDetail") || "") || undefined,
        score: Number(form.get("score") || 0),
        estimatedValue: String(form.get("estimatedValue") || "") || undefined,
        tags: tags(form.get("tags")),
        notes: String(form.get("notes") || "")
      });
      formElement.reset();
      setShowForm(false);
      setSuccess("线索已进入分配与跟进队列。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "线索创建失败。");
    } finally {
      setBusyId("");
    }
  }

  async function handleStatus(lead: CrmLeadRecord, nextStatus: CrmLeadStatus) {
    setBusyId(lead.id);
    setError("");
    setSuccess("");
    const ownerId = references.context?.ownerOptions[0]?.id;
    try {
      await updateCrmLead(lead.id, {
        status: nextStatus,
        ...(["UNASSIGNED", "RECYCLED"].includes(nextStatus) ? { ownerId: null } : {}),
        ...(nextStatus === "ASSIGNED"
          ? {
              teamId: references.selectedTeamId,
              ownerId
            }
          : {}),
        ...(nextStatus === "DISQUALIFIED" ? { lostReason: "销售人员手动判定为无效线索" } : {})
      });
      setSuccess(`线索已更新为“${CRM_LEAD_STATUS_LABELS[nextStatus]}”。`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "线索状态更新失败。");
    } finally {
      setBusyId("");
    }
  }

  async function handleConvert(lead: CrmLeadRecord) {
    const ownerId = references.context?.ownerOptions[0]?.id;
    if (!references.selectedTeamId || !ownerId) {
      setError("请先选择一个有有效负责人的团队。");
      return;
    }
    setBusyId(lead.id);
    setError("");
    setSuccess("");
    try {
      const result = await convertCrmLead(lead.id, {
        teamId: references.selectedTeamId,
        ownerId,
        customerName: lead.companyName || lead.contactName || lead.name,
        tags: lead.tags,
        notes: lead.notes,
        level: lead.score >= 80 ? "HIGH" : lead.score >= 50 ? "MEDIUM" : "LOW"
      });
      setSuccess("线索已转为客户，并写入初始阶段与等级历史。");
      await load();
      window.location.href = `/team-os/crm/customers/${encodeURIComponent(result.customerId)}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "线索转客户失败。");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CrmSalesPageHeader
        eyebrow="线索 → 客户"
        title="线索中心"
        description="统一管理市场线索、负责人、有效性判定和客户转化；个人微信数据仅支持合规导入或正式授权连接器。"
        action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />新增线索</Button>}
      />

      {references.error ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{references.error}</p> : null}
      {error ? <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><TriangleAlert className="h-4 w-4" />{error}</p> : null}
      {success ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{success}</p> : null}

      {showForm ? (
        <Card>
          <CardHeader><CardTitle>新增销售线索</CardTitle><CardDescription>至少填写手机号、邮箱或微信号之一；企业范围由服务端根据当前登录账号确定。</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
              <label className="space-y-2 text-sm font-medium text-slate-700">线索名称<Input name="name" maxLength={160} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">企业名称<Input name="companyName" maxLength={200} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">联系人<Input name="contactName" maxLength={120} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">行业<Input name="industry" maxLength={120} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">手机号<Input name="phone" maxLength={40} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">邮箱<Input name="email" type="email" maxLength={254} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">微信号<Input name="wechat" maxLength={80} /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">来源<select name="source" defaultValue="MANUAL" className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm">{CRM_LEAD_SOURCES.map((value) => <option key={value} value={value}>{CRM_LEAD_SOURCE_LABELS[value]}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">所属团队<select name="teamId" value={references.selectedTeamId ?? ""} onChange={(event) => void references.selectTeam(event.target.value)} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择团队</option>{references.context?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">负责人<select key={references.selectedTeamId} name="ownerId" defaultValue={references.context?.ownerOptions[0]?.id ?? ""} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" required><option value="">选择负责人</option>{references.context?.ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">线索评分<Input name="score" type="number" min={0} max={100} defaultValue={0} required /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700">预计价值<Input name="estimatedValue" type="number" min={0} step="0.01" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">标签<Input name="tags" placeholder="高意向，华东，转介绍" /></label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">备注<Textarea name="notes" rows={4} maxLength={5000} /></label>
              <div className="flex justify-end gap-3 md:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)} disabled={busyId === "create"}>取消</Button><Button type="submit" disabled={busyId === "create" || references.loading}>{busyId === "create" ? "保存中…" : "保存线索"}</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索线索、企业、联系人或联系方式" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="focus-ring h-11 rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部状态</option>{CRM_LEAD_STATUSES.map((value) => <option key={value} value={value}>{CRM_LEAD_STATUS_LABELS[value]}</option>)}</select>
          <Button variant="outline" onClick={() => { const next = searchInput.trim(); if (next === query) void load(); else setQuery(next); }} disabled={loading}><RefreshCw className="h-4 w-4" />查询</Button>
        </CardContent>
      </Card>

      {loading ? <Card><CardContent className="p-8 text-center text-sm text-slate-500" role="status">正在加载线索…</CardContent></Card> : null}
      {!loading && items.length === 0 ? <Card><CardContent className="p-10 text-center"><Target className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium text-slate-800">暂无符合条件的线索</p><p className="mt-1 text-sm text-slate-500">录入第一条线索，开始销售闭环。</p></CardContent></Card> : null}
      {!loading && items.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">共 {total} 条线索，本页展示 {items.length} 条</p>
          {items.map((lead) => (
            <Card key={lead.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><CardTitle>{lead.companyName || lead.name}</CardTitle><CardDescription>{lead.contactName || lead.name} · {lead.phone || lead.email || lead.wechat || "无联系方式"}</CardDescription></div>
                  <div className="flex flex-wrap gap-2"><Badge>{CRM_LEAD_STATUS_LABELS[lead.status]}</Badge><Badge variant="outline">{CRM_LEAD_SOURCE_LABELS[lead.source]}</Badge><Badge variant="warning">{lead.score} 分</Badge></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <p>团队：{lead.team?.name ?? "未分配"}</p><p>负责人：{lead.owner?.name ?? "待分配"}</p><p>预计价值：{lead.estimatedValue ? formatCrmMoney(lead.estimatedValue) : "未填写"}</p><p>下次跟进：{formatCrmSalesDate(lead.nextFollowUpAt)}</p>
                </div>
                {lead.notes ? <p className="break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700 [overflow-wrap:anywhere]">{lead.notes}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {LEAD_TRANSITIONS[lead.status].map((next) => <Button key={next} size="sm" variant="outline" onClick={() => void handleStatus(lead, next)} disabled={busyId === lead.id}>{CRM_LEAD_STATUS_LABELS[next]}</Button>)}
                  </div>
                  {lead.status === "QUALIFIED" ? <Button size="sm" onClick={() => void handleConvert(lead)} disabled={busyId === lead.id}>转为客户</Button> : lead.convertedCustomerId ? <Link href={`/team-os/crm/customers/${encodeURIComponent(lead.convertedCustomerId)}`} className="text-sm font-semibold text-indigo-700">查看客户</Link> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
