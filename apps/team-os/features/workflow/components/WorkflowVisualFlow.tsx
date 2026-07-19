import { ArrowDown, ArrowRight, BrainCircuit, CheckCircle2, PlayCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  WorkflowActionRecord,
  WorkflowActionResult,
  WorkflowActionType,
  WorkflowDefinitionRecord,
  WorkflowEventType
} from "@/apps/team-os/features/workflow/types";

export const workflowEventLabels: Record<WorkflowEventType, string> = {
  TASK_COMPLETED: "任务完成",
  TASK_OVERDUE: "任务延期",
  CRM_RISK_FOUND: "发现客户风险",
  EMPLOYEE_SCORE_LOW: "员工能力分下降",
  TRAINING_FINISHED: "培训完成",
  BUSINESS_METRIC_ALERT: "经营指标告警",
  SYSTEM_TRIGGERED: "系统事件"
};

export const workflowActionLabels: Record<WorkflowActionType, string> = {
  CREATE_TASK: "创建团队任务",
  SEND_NOTIFICATION: "发送通知",
  ASSIGN_TRAINING: "安排培训",
  CREATE_FOLLOWUP: "创建客户跟进任务",
  GENERATE_REPORT: "生成经营报告"
};

function FlowArrow() {
  return (
    <span className="flex shrink-0 items-center justify-center text-slate-300" aria-hidden="true">
      <ArrowDown className="h-5 w-5 md:hidden" />
      <ArrowRight className="hidden h-5 w-5 md:block" />
    </span>
  );
}

function StepCard({ icon, eyebrow, title, tone = "slate" }: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  tone?: "slate" | "indigo" | "emerald";
}) {
  const colors = tone === "indigo"
    ? "border-indigo-200 bg-indigo-50 text-indigo-950"
    : tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-3 ${colors}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{eyebrow}</p>
      </div>
      <p className="mt-2 text-sm font-semibold leading-5">{title}</p>
    </div>
  );
}

function actionResultLabel(action: WorkflowActionRecord, result?: WorkflowActionResult) {
  if (!result) return workflowActionLabels[action.actionType];
  const status = result.status === "SUCCESS" ? "成功" : result.status === "SKIPPED" ? "跳过" : "失败";
  return `${workflowActionLabels[action.actionType]} · ${status}`;
}

export function WorkflowVisualFlow({
  workflow,
  actionResults
}: {
  workflow: WorkflowDefinitionRecord;
  actionResults?: WorkflowActionResult[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4" aria-label={`${workflow.name} 流程图`}>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <StepCard icon={<Zap className="h-4 w-4" aria-hidden="true" />} eyebrow="Event" title={workflowEventLabels[workflow.eventType]} />
        <FlowArrow />
        <StepCard
          icon={<BrainCircuit className="h-4 w-4" aria-hidden="true" />}
          eyebrow="AI Decision"
          title={workflow.config.decision.enabled ? `置信度 ≥ ${Math.round(workflow.config.decision.minConfidence * 100)}%` : "直接执行规则"}
          tone="indigo"
        />
        <FlowArrow />
        <div className="min-w-0 flex-[2] rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {workflow.actions.map((action) => {
              const result = actionResults?.find((item) => item.actionId === action.id);
              return (
                <Badge key={action.id} variant="outline" className={result?.status === "FAILED" ? "border-rose-200 bg-rose-50 text-rose-700" : result?.status === "SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}>
                  {action.order}. {actionResultLabel(action, result)}
                </Badge>
              );
            })}
          </div>
        </div>
        <FlowArrow />
        <StepCard icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} eyebrow="Audit" title="记录执行结果" tone="emerald" />
      </div>
    </div>
  );
}
