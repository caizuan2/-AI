import type { WorkflowTemplate } from "@/apps/team-os/features/workflow/types";

export const DEFAULT_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "crm-long-time-no-follow-up",
    name: "客户长期未跟进",
    description: "发现客户风险后创建团队跟进任务，并提醒当前负责人。",
    triggerType: "CRM",
    eventType: "CRM_RISK_FOUND",
    actions: [
      {
        actionType: "CREATE_FOLLOWUP",
        order: 1,
        config: {
          title: "高风险客户跟进",
          plan: "系统发现客户存在长期未跟进风险，请尽快确认客户近况。",
          submissionRequirements: "完成有效沟通，并提交客户反馈与下一步计划。",
          deadlineDays: 1
        }
      },
      {
        actionType: "SEND_NOTIFICATION",
        order: 2,
        config: {
          title: "客户需要及时跟进",
          content: "客户风险已触发自动化流程，请查看自动创建的客户跟进任务。",
          notificationType: "CRM",
          recipient: "EVENT_USER"
        }
      }
    ]
  },
  {
    key: "employee-score-low",
    name: "员工能力下降",
    description: "员工 AI 教练评分偏低时自动安排指定课程并发送提醒。",
    triggerType: "AI_COACH",
    eventType: "EMPLOYEE_SCORE_LOW",
    actions: [
      {
        actionType: "ASSIGN_TRAINING",
        order: 1,
        config: { courseId: "", deadlineDays: 7 }
      },
      {
        actionType: "SEND_NOTIFICATION",
        order: 2,
        config: {
          title: "已生成能力提升安排",
          content: "请查看新安排的培训课程并按期完成。",
          notificationType: "AI_COACH",
          recipient: "EVENT_USER"
        }
      }
    ]
  },
  {
    key: "task-overdue",
    name: "任务延期处理",
    description: "任务超过截止时间后提醒负责人，并创建团队复盘任务。",
    triggerType: "TASK",
    eventType: "TASK_OVERDUE",
    actions: [
      {
        actionType: "SEND_NOTIFICATION",
        order: 1,
        config: {
          title: "任务已延期",
          content: "请检查任务阻塞原因并更新处理计划。",
          notificationType: "TASK",
          recipient: "EVENT_USER"
        }
      },
      {
        actionType: "CREATE_TASK",
        order: 2,
        config: {
          title: "延期任务复盘",
          description: "复盘延期原因，明确责任与新的完成节点。",
          submissionRequirements: "提交延期原因与后续行动计划。",
          deadlineDays: 2,
          targetCount: 1
        }
      }
    ]
  },
  {
    key: "business-metric-alert",
    name: "企业指标下降",
    description: "经营指标告警时生成分析报告并通知流程发起人。",
    triggerType: "ANALYTICS",
    eventType: "BUSINESS_METRIC_ALERT",
    actions: [
      {
        actionType: "GENERATE_REPORT",
        order: 1,
        config: { rangeDays: 30 }
      },
      {
        actionType: "SEND_NOTIFICATION",
        order: 2,
        config: {
          title: "企业经营指标需要关注",
          content: "AI 已完成经营分析，请在工作流执行记录中查看结果。",
          notificationType: "SYSTEM",
          recipient: "WORKFLOW_ACTOR"
        }
      }
    ]
  }
];

export function getWorkflowTemplate(key: string) {
  return DEFAULT_WORKFLOW_TEMPLATES.find((template) => template.key === key);
}
