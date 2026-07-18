"use client";

import * as React from "react";
import { Beaker, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { testWorkflow, WorkflowClientError } from "@/apps/team-os/features/workflow/services/workflow-client";
import type {
  WorkflowDefinitionRecord,
  WorkflowExecutionRecord,
  WorkflowEventType
} from "@/apps/team-os/features/workflow/types";

const referenceLabels: Record<WorkflowEventType, { label: string; placeholder: string }> = {
  TASK_COMPLETED: { label: "任务 ID", placeholder: "输入已完成任务的 ID" },
  TASK_OVERDUE: { label: "任务 ID", placeholder: "输入已延期任务的 ID" },
  CRM_RISK_FOUND: { label: "客户 ID", placeholder: "输入当前企业客户的 ID" },
  EMPLOYEE_SCORE_LOW: { label: "AI 教练报告 ID", placeholder: "输入员工分析报告 ID" },
  TRAINING_FINISHED: { label: "培训记录 ID", placeholder: "输入已完成培训记录 ID" },
  BUSINESS_METRIC_ALERT: { label: "经营指标 ID", placeholder: "输入当前企业经营指标 ID" },
  SYSTEM_TRIGGERED: { label: "无需业务引用", placeholder: "系统事件无需填写" }
};

function createEventId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `workflow-ui-test-${Date.now()}-${random}`;
}

export function WorkflowTestPanel({
  workflow,
  companyId
}: {
  workflow: WorkflowDefinitionRecord;
  companyId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [referenceId, setReferenceId] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<WorkflowExecutionRecord | null>(null);
  const reference = referenceLabels[workflow.eventType];
  const requiresReference = workflow.eventType !== "SYSTEM_TRIGGERED";

  async function handleTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const next = await testWorkflow({
        workflowId: workflow.id,
        companyId,
        event: {
          eventId: createEventId(),
          eventType: workflow.eventType,
          ...(requiresReference ? { referenceId: referenceId.trim() } : {})
        }
      });
      setResult(next);
    } catch (caught) {
      setError(caught instanceof WorkflowClientError ? caught.message : caught instanceof Error ? caught.message : "测试运行失败，请稍后重试。");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40">
      <Button type="button" variant="ghost" className="h-auto w-full justify-between px-4 py-3 text-indigo-900" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Beaker className="h-4 w-4" aria-hidden="true" />安全测试</span>
        {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </Button>
      {open ? (
        <div className="border-t border-indigo-100 p-4">
          <div className="mb-4 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800" role="note">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p><strong>Dry-run 模式：</strong>只校验事件、AI 判断和动作配置，不创建任务、不安排培训、不发送通知，也不会修改 CRM 数据。</p>
          </div>
          <form className="space-y-3" onSubmit={handleTest}>
            {requiresReference ? (
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                {reference.label}
                <Input value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder={reference.placeholder} maxLength={120} required />
              </label>
            ) : null}
            {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
            <Button type="submit" size="sm" disabled={testing || (requiresReference && !referenceId.trim())}>
              {testing ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />测试运行中…</> : "运行 Dry-run"}
            </Button>
          </form>
          {result ? (
            <Card className="mt-4 border-emerald-200 bg-white">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  <p className="font-semibold text-slate-900">测试执行已记录</p>
                  <Badge variant="outline">{result.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{result.result?.decision.reason ?? result.error?.message ?? "测试已完成，可前往执行记录查看详细动作日志。"}</p>
                <p className="mt-2 break-all text-xs text-slate-400">执行 ID：{result.id}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
