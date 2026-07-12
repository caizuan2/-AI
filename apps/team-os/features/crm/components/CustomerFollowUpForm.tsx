"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FOLLOW_UP_TYPE_LABELS } from "@/apps/team-os/features/crm/components/crm-ui";
import { createCustomerFollowUp } from "@/apps/team-os/features/crm/services/crm-client";
import { CUSTOMER_FOLLOW_UP_TYPES, type CustomerFollowUpRecord, type CustomerFollowUpType } from "@/apps/team-os/features/crm/types";

export function CustomerFollowUpForm({ customerId, onCreated }: { customerId: string; onCreated: (record: CustomerFollowUpRecord) => void | Promise<void> }) {
  const [type, setType] = React.useState<CustomerFollowUpType>("CHAT");
  const [content, setContent] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [nextPlan, setNextPlan] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!content.trim() || !summary.trim() || !nextPlan.trim()) {
      setError("文字记录、沟通总结和下一步计划不能为空。");
      return;
    }
    setSubmitting(true);
    try {
      const record = await createCustomerFollowUp({ customerId, type, content: content.trim(), summary: summary.trim(), nextPlan: nextPlan.trim() });
      await onCreated(record);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "跟进记录保存失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200">
      <CardHeader><CardTitle>新增客户跟进</CardTitle><CardDescription>记录沟通过程、总结和下一步计划，供 AI 客户画像持续更新。</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit} aria-busy={submitting}>
          <label className="block space-y-2 text-sm font-medium text-slate-700">跟进方式<select value={type} onChange={(event) => setType(event.target.value as CustomerFollowUpType)} disabled={submitting} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">{CUSTOMER_FOLLOW_UP_TYPES.map((item) => <option key={item} value={item}>{FOLLOW_UP_TYPE_LABELS[item]}</option>)}</select></label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">文字记录<Textarea value={content} onChange={(event) => setContent(event.target.value)} disabled={submitting} maxLength={10000} rows={7} required /></label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">沟通总结<Textarea value={summary} onChange={(event) => setSummary(event.target.value)} disabled={submitting} maxLength={3000} rows={4} required /></label>
          <label className="block space-y-2 text-sm font-medium text-slate-700">下一步计划<Textarea value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} disabled={submitting} maxLength={3000} rows={4} required /></label>
          {error ? <p className="break-words text-sm text-rose-700 [overflow-wrap:anywhere]" role="alert">{error}</p> : null}
          <div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? "保存中…" : "保存跟进记录"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
