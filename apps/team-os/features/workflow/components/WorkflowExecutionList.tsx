"use client";

import * as React from "react";
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, FlaskConical, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowEmptyState } from "@/apps/team-os/features/workflow/components/WorkflowState";
import { workflowActionLabels, workflowEventLabels } from "@/apps/team-os/features/workflow/components/WorkflowVisualFlow";
import type {
  WorkflowContext,
  WorkflowExecutionRecord,
  WorkflowExecutionStatus
} from "@/apps/team-os/features/workflow/types";

const statusConfig: Record<WorkflowExecutionStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  RUNNING: { label: "执行中", className: "border-sky-200 bg-sky-50 text-sky-700", icon: CircleDashed },
  SUCCESS: { label: "成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  FAILED: { label: "失败", className: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle },
  SKIPPED: { label: "未触发", className: "border-amber-200 bg-amber-50 text-amber-700", icon: AlertTriangle }
};

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value));
}

function ExecutionCard({ execution, context }: { execution: WorkflowExecutionRecord; context: WorkflowContext }) {
  const [expanded, setExpanded] = React.useState(false);
  const status = statusConfig[execution.status];
  const StatusIcon = status.icon;
  const teamName = execution.teamId ? context.teams.find((team) => team.id === execution.teamId)?.name : undefined;
  const decision = execution.result?.decision;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{execution.workflowName}</CardTitle>
            <Badge variant="outline" className={status.className}><StatusIcon className={`mr-1 h-3.5 w-3.5 ${execution.status === "RUNNING" ? "animate-spin" : ""}`} aria-hidden="true" />{status.label}</Badge>
            <Badge variant="outline" className={execution.mode === "TEST" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-700"}>{execution.mode === "TEST" ? "Dry-run" : "生产执行"}</Badge>
          </div>
          <CardDescription className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>{workflowEventLabels[execution.eventType]}</span>
            <span>{teamName ?? (execution.teamId ? "指定团队" : "企业范围")}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(execution.createdAt)}</span>
          </CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? "收起日志" : "查看日志"}
          {expanded ? <ChevronUp className="ml-1 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {decision ? (
          <div className="flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-indigo-950">AI 判断：{decision.trigger ? "满足触发条件" : "不触发动作"} · {Math.round(decision.confidence * 100)}%</p>
              <p className="mt-1 text-sm leading-6 text-indigo-800">{decision.reason}</p>
            </div>
          </div>
        ) : null}

        {execution.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            <p className="font-semibold">{execution.error.code}</p>
            <p className="mt-1 leading-6">{execution.error.message}</p>
          </div>
        ) : null}

        {expanded ? (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">事件 ID</p><p className="mt-1 break-all text-xs font-medium text-slate-700">{execution.eventId}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">执行 ID</p><p className="mt-1 break-all text-xs font-medium text-slate-700">{execution.id}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">开始时间</p><p className="mt-1 text-xs font-medium text-slate-700">{formatDate(execution.createdAt)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">结束时间</p><p className="mt-1 text-xs font-medium text-slate-700">{formatDate(execution.finishedAt)}</p></div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">动作日志</p>
              {execution.result?.actions.length ? (
                <ol className="mt-3 space-y-2">
                  {execution.result.actions.map((action) => (
                    <li key={`${action.actionId}-${action.order}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{action.order}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-900">{workflowActionLabels[action.actionType]}</p><Badge variant="outline">{action.status}</Badge></div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{action.summary}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-slate-500">本次执行未产生动作日志。</p>}
            </div>
            {execution.mode === "TEST" ? <p className="flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-xs text-violet-700"><FlaskConical className="h-4 w-4" aria-hidden="true" />Dry-run 不会执行任何业务写入或通知外发。</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WorkflowExecutionList({ context, items }: { context: WorkflowContext; items: WorkflowExecutionRecord[] }) {
  if (items.length === 0) return <WorkflowEmptyState title="暂无执行记录" description="通过工作流卡片运行安全测试后，执行决策和动作日志会显示在这里。" />;
  return <div className="space-y-4">{items.map((execution) => <ExecutionCard key={execution.id} execution={execution} context={context} />)}</div>;
}
