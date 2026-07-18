"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCustomer } from "@/apps/team-os/features/crm/services/crm-client";
import type { CrmOwnerOption, CreateCustomerResult } from "@/apps/team-os/features/crm/types";

function parseTags(value: string) {
  return Array.from(new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)));
}

export function CreateCustomerForm({ teamId, teamName, ownerOptions, onCreated, onCancel }: { teamId: string; teamName: string; ownerOptions: CrmOwnerOption[]; onCreated: (result: CreateCustomerResult) => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [wechat, setWechat] = React.useState("");
  const [source, setSource] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [ownerId, setOwnerId] = React.useState(ownerOptions[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsedTags = parseTags(tags);
    if (!name.trim() || !source.trim()) {
      setError("客户姓名和客户来源不能为空。");
      return;
    }
    if (!phone.trim() && !wechat.trim()) {
      setError("手机号和微信号至少填写一项。");
      return;
    }
    if (parsedTags.length > 20 || parsedTags.some((tag) => tag.length > 40)) {
      setError("客户标签最多 20 个，每个标签不能超过 40 个字符。");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createCustomer({ teamId, ownerId: ownerId || undefined, name: name.trim(), phone: phone.trim() || undefined, wechat: wechat.trim() || undefined, source: source.trim(), tags: parsedTags, notes: notes.trim() });
      await onCreated(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "客户创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/50">
      <CardHeader><CardTitle>新增客户</CardTitle><CardDescription>客户将进入当前团队客户池，阶段默认为潜在线索。</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit} aria-busy={submitting}>
          <label className="space-y-2 text-sm font-medium text-slate-700">客户姓名<Input value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} maxLength={120} autoFocus required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">所属团队<Input value={teamName} disabled /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">手机号<Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={submitting} maxLength={40} placeholder="可选" /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">微信号<Input value={wechat} onChange={(event) => setWechat(event.target.value)} disabled={submitting} maxLength={80} placeholder="可选" /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">客户来源<Input value={source} onChange={(event) => setSource(event.target.value)} disabled={submitting} maxLength={120} placeholder="例如：老客户转介绍" required /></label>
          {ownerOptions.length > 1 ? <label className="space-y-2 text-sm font-medium text-slate-700">负责人<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={submitting} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label> : ownerOptions[0] ? <label className="space-y-2 text-sm font-medium text-slate-700">负责人<Input value={ownerOptions[0].name} disabled /></label> : null}
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">标签<Textarea value={tags} onChange={(event) => setTags(event.target.value)} disabled={submitting} maxLength={1000} rows={2} placeholder="高意向，母婴，老客户转介绍" /><span className="block text-xs font-normal text-slate-500">使用逗号或换行分隔，最多 20 个。</span></label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">备注<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} maxLength={5000} rows={5} placeholder="记录客户背景、需求或其他说明。" /></label>
          {error ? <p className="break-words text-sm text-rose-700 [overflow-wrap:anywhere] md:col-span-2" role="alert">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 md:col-span-2"><Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "保存客户"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
