"use client";

import * as React from "react";
import { BrainCircuit, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { analyzeCustomer } from "@/apps/team-os/features/crm/services/crm-client";
import type { AnalyzeCustomerResult } from "@/apps/team-os/features/crm/types";

export function CustomerAnalysisPanel({ customerId, onAnalyzed }: { customerId: string; onAnalyzed: (result: AnalyzeCustomerResult) => void | Promise<void> }) {
  const [conversation, setConversation] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const result = await analyzeCustomer({ customerId, conversation: conversation.trim() || undefined });
      setSuccess(true);
      await onAnalyzed(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 客户分析失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-indigo-700" aria-hidden="true" />手动 AI 分析</CardTitle><CardDescription>结合客户资料、跟进历史、企业知识与 AI Coach 能力更新客户画像。</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit} aria-busy={submitting}>
          <label className="block space-y-2 text-sm font-medium text-slate-700">补充沟通内容（可选）<Textarea value={conversation} onChange={(event) => setConversation(event.target.value)} disabled={submitting} maxLength={20000} rows={5} placeholder="粘贴尚未录入跟进记录的补充沟通内容。" /></label>
          {error ? <p className="break-words text-sm text-rose-700 [overflow-wrap:anywhere]" role="alert">{error}</p> : null}
          {success ? <p className="flex items-center gap-2 text-sm text-emerald-700" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />客户画像与跟进建议已更新。</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "AI 分析中…" : "分析客户状态"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
