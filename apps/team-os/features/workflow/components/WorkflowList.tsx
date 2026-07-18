import Link from "next/link";
import { Bot, CalendarClock, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowEmptyState } from "@/apps/team-os/features/workflow/components/WorkflowState";
import { WorkflowTestPanel } from "@/apps/team-os/features/workflow/components/WorkflowTestPanel";
import {
  WorkflowVisualFlow,
  workflowEventLabels
} from "@/apps/team-os/features/workflow/components/WorkflowVisualFlow";
import type {
  WorkflowContext,
  WorkflowDefinitionRecord
} from "@/apps/team-os/features/workflow/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}

export function WorkflowList({ context, items }: {
  context: WorkflowContext;
  items: WorkflowDefinitionRecord[];
}) {
  const teamNames = new Map(context.teams.map((team) => [team.id, team.name]));
  if (items.length === 0) {
    return (
      <WorkflowEmptyState
        title="还没有可查看的工作流"
        description={context.canCreate ? "从企业自动化模板开始，配置触发事件、AI 判断和有序动作。" : "当前培训权限范围内暂无工作流。"}
        action={context.canCreate ? <Link href={`/team-os/workflow/create?companyId=${encodeURIComponent(context.companyId)}`} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800"><Plus className="h-4 w-4" aria-hidden="true" />创建工作流</Link> : undefined}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">可见流程</p><p className="mt-1 text-2xl font-semibold text-slate-950">{items.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">已启用</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{items.filter((item) => item.status === "ACTIVE").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">包含 AI 判断</p><p className="mt-1 text-2xl font-semibold text-indigo-700">{items.filter((item) => item.config.decision.enabled).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">自动化动作</p><p className="mt-1 text-2xl font-semibold text-slate-950">{items.reduce((sum, item) => sum + item.actions.length, 0)}</p></CardContent></Card>
      </div>

      {items.map((workflow) => (
        <Card key={workflow.id} className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{workflow.name}</CardTitle>
                <Badge className={workflow.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{workflow.status === "ACTIVE" ? "运行中" : "已停用"}</Badge>
                <Badge variant="outline">{workflowEventLabels[workflow.eventType]}</Badge>
              </div>
              <CardDescription className="mt-2 max-w-3xl leading-6">{workflow.description}</CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><UsersRound className="h-3.5 w-3.5" aria-hidden="true" />{workflow.scopeTeamId ? teamNames.get(workflow.scopeTeamId) ?? "指定团队" : "企业范围"}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><Bot className="h-3.5 w-3.5" aria-hidden="true" />{workflow.config.decision.enabled ? "AI 判断" : "规则直达"}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkflowVisualFlow workflow={workflow} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />更新于 {formatDate(workflow.updatedAt)}</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />业务动作由服务端重新鉴权</span>
            </div>
            {context.canExecute && workflow.status === "ACTIVE" ? <WorkflowTestPanel workflow={workflow} companyId={context.companyId} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
