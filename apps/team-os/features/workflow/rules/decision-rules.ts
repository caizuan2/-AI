import type {
  HydratedWorkflowEvent,
  WorkflowDecisionResult
} from "@/apps/team-os/features/workflow/types";

export function evaluateWorkflowRules(event: HydratedWorkflowEvent): WorkflowDecisionResult {
  if (event.eventType === "TASK_OVERDUE") {
    const trigger = event.businessData.overdue === true;
    return { trigger, reason: trigger ? "任务已超过截止时间且仍未关闭。" : "任务当前不满足延期条件。", confidence: trigger ? 0.99 : 0.2, provider: "rules" };
  }
  if (event.eventType === "CRM_RISK_FOUND") {
    const level = event.businessData.riskLevel;
    const trigger = level === "HIGH";
    return { trigger, reason: trigger ? "客户风险等级为高风险。" : "客户尚未达到高风险触发线。", confidence: trigger ? 0.95 : 0.35, provider: "rules" };
  }
  if (event.eventType === "EMPLOYEE_SCORE_LOW") {
    const score = typeof event.businessData.employeeScore === "number"
      ? event.businessData.employeeScore
      : 100;
    const trigger = score < 60;
    return { trigger, reason: trigger ? `员工能力评分为 ${score} 分，低于 60 分。` : `员工能力评分为 ${score} 分，未低于触发线。`, confidence: trigger ? 0.94 : 0.25, provider: "rules" };
  }
  if (event.eventType === "TRAINING_FINISHED") {
    const trigger = event.businessData.trainingStatus === "COMPLETED";
    return { trigger, reason: trigger ? "培训记录已完成。" : "培训记录尚未完成。", confidence: trigger ? 0.99 : 0.1, provider: "rules" };
  }
  if (event.eventType === "TASK_COMPLETED") {
    const trigger = event.businessData.taskStatus === "COMPLETED";
    return { trigger, reason: trigger ? "任务状态已完成。" : "任务尚未完成。", confidence: trigger ? 0.99 : 0.1, provider: "rules" };
  }
  if (event.eventType === "BUSINESS_METRIC_ALERT") {
    return { trigger: true, reason: "收到已经过服务端验证的经营指标告警事件。", confidence: 0.85, provider: "rules" };
  }
  return { trigger: true, reason: "收到经过权限验证的系统手动事件。", confidence: 0.8, provider: "rules" };
}
