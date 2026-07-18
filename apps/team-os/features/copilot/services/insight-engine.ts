import type {
  CopilotInsightCandidate,
  EmployeeCopilotSnapshot,
  ManagerCopilotSnapshot,
  OwnerCopilotSnapshot
} from "@/apps/team-os/features/copilot/types";

function limited(items: CopilotInsightCandidate[]) {
  const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return items
    .sort((left, right) => priority[left.priority] - priority[right.priority])
    .slice(0, 30);
}

export function employeeInsights(snapshot: EmployeeCopilotSnapshot): CopilotInsightCandidate[] {
  const insights: CopilotInsightCandidate[] = [];
  for (const task of snapshot.tasks) {
    if (task.overdue && !task.submittedByCurrentUser) {
      insights.push({
        sourceKey: `TASK:${task.id}`,
        type: "TASK",
        title: "团队任务已超过截止时间",
        content: `团队任务「${task.title}」已逾期，当前还没有你的提交记录。`,
        recommendation: "尽快核对任务要求并提交进展；如存在阻塞，主动向主管说明。",
        priority: "HIGH",
        teamId: task.teamId,
        href: "/team-os/tasks/my",
        notificationType: "TASK"
      });
    }
  }
  for (const customer of snapshot.customers) {
    if (customer.daysSinceFollowUp >= 3 || customer.riskLevel === "HIGH") {
      insights.push({
        sourceKey: `CRM:${customer.id}`,
        type: "CRM",
        title: "客户需要及时跟进",
        content: `客户 ${customer.maskedName} 已 ${customer.daysSinceFollowUp >= 999 ? "暂无跟进记录" : `${customer.daysSinceFollowUp} 天未跟进`}。`,
        recommendation: "今天完成一次有效沟通，并记录客户反馈和下一步计划。",
        priority: customer.riskLevel === "HIGH" || customer.daysSinceFollowUp >= 7 ? "HIGH" : "MEDIUM",
        teamId: customer.teamId,
        href: "/team-os/crm",
        notificationType: "CRM"
      });
    }
  }
  for (const assignment of snapshot.training) {
    if (assignment.overdue) {
      insights.push({
        sourceKey: `TRAINING:${assignment.id}`,
        type: "TRAINING",
        title: "培训任务已逾期",
        content: `课程「${assignment.courseTitle}」尚未完成并已超过截止时间。`,
        recommendation: "安排专注学习时间完成课程，并在学习后进行一次模拟练习。",
        priority: "HIGH",
        teamId: assignment.teamId,
        href: "/team-os/training",
        notificationType: "TRAINING"
      });
    }
  }
  if (snapshot.growth && snapshot.growth.score < 60) {
    insights.push({
      sourceKey: "AI_COACH:LATEST_LOW_SCORE",
      type: "TRAINING",
      title: "近期能力评分需要关注",
      content: `最近一次 AI 教练综合评分为 ${snapshot.growth.score} 分。`,
      recommendation: snapshot.growth.trainingPlan || snapshot.growth.suggestions[0] || "结合报告问题完成一次针对性训练。",
      priority: "HIGH",
      href: "/team-os/ai-coach",
      notificationType: "AI_COACH"
    });
  }
  return limited(insights);
}

export function managerInsights(snapshot: ManagerCopilotSnapshot): CopilotInsightCandidate[] {
  const insights: CopilotInsightCandidate[] = [];
  if (snapshot.overdueTaskCount > 0) {
    insights.push({
      sourceKey: "TASK:TEAM_OVERDUE",
      type: "TASK",
      title: "团队存在逾期任务",
      content: `当前管理范围内有 ${snapshot.overdueTaskCount} 个任务已逾期。`,
      recommendation: "逐项确认负责人和阻塞原因，并为今天设置可验证的推进节点。",
      priority: snapshot.overdueTaskCount >= 3 ? "HIGH" : "MEDIUM",
      href: "/team-os/tasks",
      notificationType: "TASK"
    });
  }
  for (const member of snapshot.members) {
    if (member.submissionCount === 0 || (member.coachScore !== undefined && member.coachScore < 60)) {
      insights.push({
        sourceKey: `TEAM:${member.teamId}:${member.userId}`,
        type: "TEAM",
        title: "团队成员需要辅导",
        content: `${member.employeeName} 最近 3 天任务提交 ${member.submissionCount} 次${member.coachScore !== undefined ? `，最近教练评分 ${member.coachScore} 分` : ""}。`,
        recommendation: "安排一次一对一沟通，确认执行障碍并给出具体训练任务。",
        priority: member.submissionCount === 0 && (member.coachScore ?? 100) < 60 ? "HIGH" : "MEDIUM",
        teamId: member.teamId,
        href: "/team-os/ai-coach/team",
        notificationType: "AI_COACH"
      });
    }
  }
  for (const customer of snapshot.customerRisks) {
    insights.push({
      sourceKey: `CRM:${customer.id}`,
      type: "CRM",
      title: "高风险客户需要主管介入",
      content: `客户 ${customer.maskedName} 当前为高风险，由 ${customer.ownerName} 负责，已 ${customer.daysSinceFollowUp >= 999 ? "暂无跟进记录" : `${customer.daysSinceFollowUp} 天未跟进`}。`,
      recommendation: "今天复盘客户情况，明确下一次沟通目标并检查执行结果。",
      priority: "HIGH",
      teamId: customer.teamId,
      href: "/team-os/crm",
      notificationType: "CRM"
    });
  }
  if (snapshot.overdueTrainingCount > 0) {
    insights.push({
      sourceKey: "TRAINING:TEAM_OVERDUE",
      type: "TRAINING",
      title: "团队培训存在逾期",
      content: `${snapshot.overdueTrainingCount} 个培训安排已逾期。`,
      recommendation: "根据岗位问题重新排序课程优先级，并为逾期员工安排补训。",
      priority: snapshot.overdueTrainingCount >= 3 ? "HIGH" : "MEDIUM",
      href: "/team-os/training/manage",
      notificationType: "TRAINING"
    });
  }
  return limited(insights);
}

export function ownerInsights(snapshot: OwnerCopilotSnapshot): CopilotInsightCandidate[] {
  const insights: CopilotInsightCandidate[] = [];
  if (snapshot.taskCompletionRate !== null && snapshot.taskCompletionRate < 70) {
    insights.push({
      sourceKey: "BUSINESS:TASK_COMPLETION_LOW",
      type: "BUSINESS",
      title: "任务完成率低于健康线",
      content: `近 30 天任务完成率为 ${Math.round(snapshot.taskCompletionRate)}%。`,
      recommendation: "要求各主管复盘逾期原因，并建立每日任务闭环检查。",
      priority: snapshot.taskCompletionRate < 50 ? "HIGH" : "MEDIUM",
      href: "/team-os/analytics",
      notificationType: "TASK"
    });
  }
  if (snapshot.employeeAverageScore !== null && snapshot.employeeAverageScore < 60) {
    insights.push({
      sourceKey: "BUSINESS:EMPLOYEE_SCORE_LOW",
      type: "TEAM",
      title: "团队平均能力分需要关注",
      content: `近 30 天员工平均能力分为 ${Math.round(snapshot.employeeAverageScore)} 分。`,
      recommendation: "聚焦共性能力短板，要求主管制定分层辅导和复训计划。",
      priority: "HIGH",
      href: "/team-os/analytics/team",
      notificationType: "AI_COACH"
    });
  }
  if (snapshot.riskCustomerCount > 0) {
    insights.push({
      sourceKey: "BUSINESS:CRM_RISK",
      type: "CRM",
      title: "企业存在高风险客户",
      content: `当前分析范围内有 ${snapshot.riskCustomerCount} 个高风险客户。`,
      recommendation: "要求销售主管逐一确认风险客户的跟进策略与下一节点。",
      priority: snapshot.riskCustomerCount >= 5 ? "HIGH" : "MEDIUM",
      href: "/team-os/analytics/crm",
      notificationType: "CRM"
    });
  }
  if (snapshot.trainingCompletionRate !== null && snapshot.trainingCompletionRate < 60) {
    insights.push({
      sourceKey: "BUSINESS:TRAINING_COMPLETION_LOW",
      type: "TRAINING",
      title: "培训完成率偏低",
      content: `近 30 天培训完成率为 ${Math.round(snapshot.trainingCompletionRate)}%。`,
      recommendation: "将培训与实际业务问题绑定，并由主管跟踪课程完成和实战验证。",
      priority: snapshot.trainingCompletionRate < 40 ? "HIGH" : "MEDIUM",
      href: "/team-os/analytics/training",
      notificationType: "TRAINING"
    });
  }
  return limited(insights);
}

export class InsightEngine {
  forEmployee(snapshot: EmployeeCopilotSnapshot) {
    return employeeInsights(snapshot);
  }

  forManager(snapshot: ManagerCopilotSnapshot) {
    return managerInsights(snapshot);
  }

  forOwner(snapshot: OwnerCopilotSnapshot) {
    return ownerInsights(snapshot);
  }
}

export const insightEngine = new InsightEngine();
