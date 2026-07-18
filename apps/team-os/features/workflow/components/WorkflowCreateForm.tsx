"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Bot, CheckCircle2, GripVertical, LoaderCircle, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWorkflowDefinition, WorkflowClientError } from "@/apps/team-os/features/workflow/services/workflow-client";
import {
  EVENT_TRIGGER_MAP,
  allowedActionsForEvent
} from "@/apps/team-os/features/workflow/rules/workflow-rules";
import {
  WORKFLOW_EVENT_TYPES,
  type AssignTrainingActionConfig,
  type CreateFollowUpActionConfig,
  type CreateTaskActionConfig,
  type GenerateReportActionConfig,
  type SendNotificationActionConfig,
  type WorkflowActionConfig,
  type WorkflowActionInput,
  type WorkflowActionType,
  type WorkflowContext,
  type WorkflowEventType,
  type WorkflowStatus,
  type WorkflowTemplate
} from "@/apps/team-os/features/workflow/types";
import {
  workflowActionLabels,
  workflowEventLabels
} from "@/apps/team-os/features/workflow/components/WorkflowVisualFlow";

const notificationTypes = ["TASK", "AI_COACH", "CRM", "TRAINING", "SYSTEM"] as const;
const notificationLabels = { TASK: "任务", AI_COACH: "AI 教练", CRM: "CRM", TRAINING: "培训", SYSTEM: "系统" } as const;

function defaultConfig(actionType: WorkflowActionType): WorkflowActionConfig {
  if (actionType === "CREATE_TASK") return { title: "待处理任务", description: "请根据自动化事件完成处理。", submissionRequirements: "提交处理结果和总结。", deadlineDays: 2, targetCount: 1 };
  if (actionType === "SEND_NOTIFICATION") return { title: "自动化提醒", content: "有一项企业自动化事件需要关注。", notificationType: "SYSTEM", recipient: "EVENT_USER" };
  if (actionType === "ASSIGN_TRAINING") return { courseId: "", deadlineDays: 7 };
  if (actionType === "CREATE_FOLLOWUP") return { title: "客户跟进任务", plan: "请及时联系客户并确认当前需求。", submissionRequirements: "提交客户反馈与下一步计划。", deadlineDays: 1 };
  return { rangeDays: 30 };
}

function cloneActions(actions: WorkflowActionInput[]) {
  return actions.map((action, index) => ({
    actionType: action.actionType,
    order: index + 1,
    config: { ...action.config }
  })) as WorkflowActionInput[];
}

function ActionConfigFields({
  action,
  onChange
}: {
  action: WorkflowActionInput;
  onChange: (config: WorkflowActionConfig) => void;
}) {
  if (action.actionType === "CREATE_TASK") {
    const config = action.config as CreateTaskActionConfig;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="任务标题"><Input value={config.title} onChange={(event) => onChange({ ...config, title: event.target.value })} maxLength={120} required /></Field>
        <Field label="截止天数"><Input type="number" min={1} max={90} value={config.deadlineDays} onChange={(event) => onChange({ ...config, deadlineDays: Number(event.target.value) })} required /></Field>
        <Field label="任务描述" className="sm:col-span-2"><Textarea value={config.description} onChange={(event) => onChange({ ...config, description: event.target.value })} maxLength={5000} required /></Field>
        <Field label="提交要求" className="sm:col-span-2"><Textarea value={config.submissionRequirements} onChange={(event) => onChange({ ...config, submissionRequirements: event.target.value })} maxLength={2000} required /></Field>
        <Field label="目标数量"><Input type="number" min={1} max={10000} value={config.targetCount} onChange={(event) => onChange({ ...config, targetCount: Number(event.target.value) })} required /></Field>
      </div>
    );
  }
  if (action.actionType === "SEND_NOTIFICATION") {
    const config = action.config as SendNotificationActionConfig;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="通知标题"><Input value={config.title} onChange={(event) => onChange({ ...config, title: event.target.value })} maxLength={160} required /></Field>
        <Field label="通知类型"><StyledSelect value={config.notificationType} onChange={(value) => onChange({ ...config, notificationType: value as SendNotificationActionConfig["notificationType"] })}>{notificationTypes.map((type) => <option key={type} value={type}>{notificationLabels[type]}</option>)}</StyledSelect></Field>
        <Field label="通知内容" className="sm:col-span-2"><Textarea value={config.content} onChange={(event) => onChange({ ...config, content: event.target.value })} maxLength={2000} required /></Field>
        <Field label="接收人"><StyledSelect value={config.recipient} onChange={(value) => onChange({ ...config, recipient: value as SendNotificationActionConfig["recipient"] })}><option value="EVENT_USER">事件关联成员</option><option value="WORKFLOW_ACTOR">流程发起人</option></StyledSelect></Field>
      </div>
    );
  }
  if (action.actionType === "ASSIGN_TRAINING") {
    const config = action.config as AssignTrainingActionConfig;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="培训课程 ID"><Input value={config.courseId} onChange={(event) => onChange({ ...config, courseId: event.target.value })} maxLength={120} placeholder="输入当前企业启用课程的 ID" required /></Field>
        <Field label="完成期限（天）"><Input type="number" min={1} max={90} value={config.deadlineDays} onChange={(event) => onChange({ ...config, deadlineDays: Number(event.target.value) })} required /></Field>
      </div>
    );
  }
  if (action.actionType === "CREATE_FOLLOWUP") {
    const config = action.config as CreateFollowUpActionConfig;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="跟进任务标题"><Input value={config.title} onChange={(event) => onChange({ ...config, title: event.target.value })} maxLength={120} required /></Field>
        <Field label="截止天数"><Input type="number" min={1} max={30} value={config.deadlineDays} onChange={(event) => onChange({ ...config, deadlineDays: Number(event.target.value) })} required /></Field>
        <Field label="跟进计划" className="sm:col-span-2"><Textarea value={config.plan} onChange={(event) => onChange({ ...config, plan: event.target.value })} maxLength={5000} required /></Field>
        <Field label="提交要求" className="sm:col-span-2"><Textarea value={config.submissionRequirements} onChange={(event) => onChange({ ...config, submissionRequirements: event.target.value })} maxLength={2000} required /></Field>
      </div>
    );
  }
  const config = action.config as GenerateReportActionConfig;
  return <Field label="分析周期"><StyledSelect value={String(config.rangeDays)} onChange={(value) => onChange({ rangeDays: Number(value) as GenerateReportActionConfig["rangeDays"] })}><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option></StyledSelect></Field>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`space-y-2 text-sm font-medium text-slate-700 ${className ?? ""}`}>{label}{children}</label>;
}

function StyledSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm">{children}</select>;
}

export function WorkflowCreateForm({
  context,
  templates,
  onCreated
}: {
  context: WorkflowContext;
  templates: WorkflowTemplate[];
  onCreated: () => void;
}) {
  const initialTeamId = context.permissionLevel === "MANAGER" ? context.manageableTeamIds[0] ?? "" : "";
  const [templateKey, setTemplateKey] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scopeTeamId, setScopeTeamId] = React.useState(initialTeamId);
  const [eventType, setEventType] = React.useState<WorkflowEventType>("SYSTEM_TRIGGERED");
  const [status, setStatus] = React.useState<WorkflowStatus>("ACTIVE");
  const [decisionEnabled, setDecisionEnabled] = React.useState(true);
  const [confidence, setConfidence] = React.useState("0.7");
  const [actions, setActions] = React.useState<WorkflowActionInput[]>([{ actionType: "SEND_NOTIFICATION", order: 1, config: defaultConfig("SEND_NOTIFICATION") }]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const manageableTeams = context.teams.filter((team) => context.manageableTeamIds.includes(team.id));
  const availableTemplates = context.permissionLevel === "MANAGER"
    ? templates.filter((template) => template.eventType !== "BUSINESS_METRIC_ALERT")
    : templates;
  const availableEventTypes = context.permissionLevel === "MANAGER"
    ? WORKFLOW_EVENT_TYPES.filter((type) => type !== "BUSINESS_METRIC_ALERT")
    : WORKFLOW_EVENT_TYPES;
  function availableActionsForScope(nextEventType: WorkflowEventType, nextScopeTeamId: string) {
    return allowedActionsForEvent(nextEventType).filter((actionType) => (
      (!nextScopeTeamId || actionType !== "GENERATE_REPORT") &&
      (
        (actionType !== "CREATE_TASK" && actionType !== "CREATE_FOLLOWUP") ||
        Boolean(nextScopeTeamId && context.taskActionTeamIds.includes(nextScopeTeamId))
      )
    ));
  }
  const allowedActions = availableActionsForScope(eventType, scopeTeamId);

  React.useEffect(() => {
    if (context.permissionLevel === "MANAGER" && !scopeTeamId && manageableTeams[0]?.id) setScopeTeamId(manageableTeams[0].id);
  }, [context.permissionLevel, manageableTeams, scopeTeamId]);

  React.useEffect(() => {
    setActions((current) => {
      const filtered = current.filter((action) => (
        (!scopeTeamId || action.actionType !== "GENERATE_REPORT") &&
        (
          (action.actionType !== "CREATE_TASK" && action.actionType !== "CREATE_FOLLOWUP") ||
          Boolean(scopeTeamId && context.taskActionTeamIds.includes(scopeTeamId))
        )
      ));
      if (filtered.length === current.length) return current;
      const next = filtered.length > 0
        ? filtered
        : [{ actionType: "SEND_NOTIFICATION" as const, config: defaultConfig("SEND_NOTIFICATION"), order: 1 }];
      return next.map((action, index) => ({ ...action, order: index + 1 }));
    });
  }, [context.taskActionTeamIds, scopeTeamId]);

  function applyTemplate(key: string) {
    const template = templates.find((item) => item.key === key);
    if (!template) return;
    const hasReportAction = template.actions.some((action) => action.actionType === "GENERATE_REPORT");
    const hasTaskAction = template.actions.some((action) => (
      action.actionType === "CREATE_TASK" || action.actionType === "CREATE_FOLLOWUP"
    ));
    const nextScopeTeamId = hasReportAction
      ? ""
      : hasTaskAction && !context.taskActionTeamIds.includes(scopeTeamId)
        ? context.taskActionTeamIds[0] ?? ""
        : scopeTeamId;
    setTemplateKey(template.key);
    setName(template.name);
    setDescription(template.description);
    setEventType(template.eventType);
    setScopeTeamId(nextScopeTeamId);
    const templateActions = cloneActions(template.actions).filter((action) => (
      (!nextScopeTeamId || action.actionType !== "GENERATE_REPORT") &&
      (
        (action.actionType !== "CREATE_TASK" && action.actionType !== "CREATE_FOLLOWUP") ||
        Boolean(nextScopeTeamId && context.taskActionTeamIds.includes(nextScopeTeamId))
      )
    ));
    setActions(templateActions.length > 0
      ? templateActions.map((action, index) => ({ ...action, order: index + 1 }))
      : [{ actionType: "SEND_NOTIFICATION", order: 1, config: defaultConfig("SEND_NOTIFICATION") }]);
    setDecisionEnabled(true);
    setConfidence("0.7");
    setError(null);
  }

  function changeEvent(next: WorkflowEventType) {
    setEventType(next);
    setTemplateKey("");
    const first = availableActionsForScope(next, scopeTeamId)[0] ?? "SEND_NOTIFICATION";
    setActions([{ actionType: first, order: 1, config: defaultConfig(first) }]);
  }

  function updateAction(index: number, config: WorkflowActionConfig) {
    setActions((current) => current.map((action, position) => position === index ? { ...action, config } as WorkflowActionInput : action));
  }

  function addAction() {
    if (actions.length >= 10) return;
    const actionType = allowedActions[0];
    setActions((current) => [...current, { actionType, config: defaultConfig(actionType), order: current.length + 1 }]);
  }

  function changeActionType(index: number, actionType: WorkflowActionType) {
    setActions((current) => current.map((action, position) => position === index ? { actionType, config: defaultConfig(actionType), order: action.order } : action));
  }

  function moveAction(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= actions.length) return;
    setActions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next.map((action, position) => ({ ...action, order: position + 1 }));
    });
  }

  function removeAction(index: number) {
    if (actions.length === 1) return;
    setActions((current) => current.filter((_, position) => position !== index).map((action, position) => ({ ...action, order: position + 1 })));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createWorkflowDefinition({
        companyId: context.companyId,
        ...(scopeTeamId ? { scopeTeamId } : {}),
        name,
        description,
        triggerType: EVENT_TRIGGER_MAP[eventType],
        eventType,
        status,
        decision: { enabled: decisionEnabled, minConfidence: Number(confidence) },
        ...(templateKey ? { templateKey } : {}),
        actions
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof WorkflowClientError ? caught.message : caught instanceof Error ? caught.message : "工作流创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        <CardHeader><div className="flex items-center gap-2 text-indigo-700"><Sparkles className="h-5 w-5" aria-hidden="true" /><CardTitle className="text-lg">场景模板</CardTitle></div><CardDescription>模板只会预填表单，确认提交后才会为当前企业创建工作流。</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {availableTemplates.map((template) => <Button key={template.key} type="button" variant="outline" className={`h-auto items-start justify-start whitespace-normal p-4 text-left ${templateKey === template.key ? "border-indigo-500 bg-indigo-50" : "bg-white"}`} onClick={() => applyTemplate(template.key)}><span><span className="block font-semibold text-slate-900">{template.name}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{template.description}</span></span></Button>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. 基础信息与权限范围</CardTitle><CardDescription>企业由当前登录态确定；主管只能创建自己直接管理团队的流程。</CardDescription></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <Field label="工作流名称"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="例如：客户风险自动跟进" required /></Field>
          <Field label="生效范围"><StyledSelect value={scopeTeamId} onChange={setScopeTeamId}>{context.canManageCompany ? <option value="">整个企业</option> : null}{manageableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</StyledSelect></Field>
          <Field label="工作流说明" className="lg:col-span-2"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="说明触发条件、期望结果和适用边界。" required /></Field>
          <Field label="初始状态"><StyledSelect value={status} onChange={(value) => setStatus(value as WorkflowStatus)}><option value="ACTIVE">创建后启用</option><option value="DISABLED">暂存为停用</option></StyledSelect></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. 选择触发事件</CardTitle><CardDescription>服务端会根据业务引用重新读取企业、团队和事件数据，不信任客户端传入的业务上下文。</CardDescription></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <Field label="具体事件"><StyledSelect value={eventType} onChange={(value) => changeEvent(value as WorkflowEventType)}>{availableEventTypes.map((type) => <option key={type} value={type}>{workflowEventLabels[type]}</option>)}</StyledSelect></Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">触发领域</p><p className="mt-1 flex items-center gap-2 font-semibold text-slate-900"><Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />{EVENT_TRIGGER_MAP[eventType]}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">3. AI 判断门槛</CardTitle><CardDescription>AI 只判断是否触发流程，不获得超出当前企业和团队范围的数据。</CardDescription></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4"><div><p className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="h-4 w-4 text-indigo-600" aria-hidden="true" />启用 AI 决策</p><p className="mt-1 text-xs leading-5 text-slate-500">关闭后仍执行确定性规则判断，但不会调用外部模型。</p></div><Button type="button" variant={decisionEnabled ? "default" : "outline"} size="sm" aria-pressed={decisionEnabled} onClick={() => setDecisionEnabled((value) => !value)}>{decisionEnabled ? "已启用" : "已关闭"}</Button></div>
          </div>
          <Field label="最低置信度（0-1）"><Input type="number" min={0} max={1} step={0.05} value={confidence} onChange={(event) => setConfidence(event.target.value)} disabled={!decisionEnabled} required /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-lg">4. 动作编排</CardTitle><CardDescription className="mt-1">动作严格按 1 到 {actions.length} 顺序执行；单个动作失败后停止后续动作。</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={addAction} disabled={actions.length >= 10}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />添加动作</Button></CardHeader>
        <CardContent className="space-y-4">
          {actions.map((action, index) => (
            <div key={`${index}-${action.actionType}`} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">{index + 1}</span>
                <GripVertical className="h-4 w-4 text-slate-300" aria-hidden="true" />
                <select value={action.actionType} onChange={(event) => changeActionType(index, event.target.value as WorkflowActionType)} className="focus-ring h-10 min-w-48 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">{allowedActions.map((type) => <option key={type} value={type}>{workflowActionLabels[type]}</option>)}</select>
                <Button type="button" variant="ghost" size="icon" onClick={() => moveAction(index, -1)} disabled={index === 0} aria-label="上移动作"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => moveAction(index, 1)} disabled={index === actions.length - 1} aria-label="下移动作"><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeAction(index)} disabled={actions.length === 1} aria-label="删除动作" className="text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <ActionConfigFields action={action} onChange={(config) => updateAction(index, config)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{error}</div> : null}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />创建只保存工作流定义，不会立即执行任何业务动作。</p>
        <Button type="submit" disabled={submitting || actions.length === 0 || (context.permissionLevel === "MANAGER" && !scopeTeamId)}>{submitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />创建中…</> : "创建工作流"}</Button>
      </div>
    </form>
  );
}
