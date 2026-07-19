import type { WorkflowActionType } from "@/apps/team-os/features/workflow/types";

export const WORKFLOW_ACTION_PREVIEWS: Record<WorkflowActionType, string> = {
  CREATE_TASK: "将通过任务服务创建团队任务，不会指定个人执行人。",
  SEND_NOTIFICATION: "将通过通知网关向服务端推导的接收人发送站内通知。",
  ASSIGN_TRAINING: "将通过培训服务给事件员工安排课程。",
  CREATE_FOLLOWUP: "将通过任务服务创建客户跟进团队任务，不写入虚假的 CRM 沟通历史。",
  GENERATE_REPORT: "将读取授权范围内的聚合数据并生成经营报告。"
};

export function workflowActionPreview(actionType: WorkflowActionType) {
  return WORKFLOW_ACTION_PREVIEWS[actionType];
}
