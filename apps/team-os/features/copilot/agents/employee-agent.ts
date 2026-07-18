import { EMPLOYEE_COPILOT_SYSTEM_PROMPT } from "@/apps/team-os/features/copilot/prompts/employee-prompt";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";
import { loadEmployeeCopilotSnapshot } from "@/apps/team-os/features/copilot/services/copilot-repository";
import { insightEngine } from "@/apps/team-os/features/copilot/services/insight-engine";
import type { CopilotDashboardData } from "@/apps/team-os/features/copilot/types";
import { dueLabel } from "@/apps/team-os/features/copilot/utils/copilot-time";
import { dashboardFallbackAnswer, type CopilotAgent } from "@/apps/team-os/features/copilot/agents/types";

export class EmployeeAgent implements CopilotAgent {
  readonly role = "EMPLOYEE_ASSISTANT" as const;
  readonly systemPrompt = EMPLOYEE_COPILOT_SYSTEM_PROMPT;

  async buildDashboard(scope: CopilotAccessScope): Promise<CopilotDashboardData> {
    const snapshot = await loadEmployeeCopilotSnapshot(scope);
    const insights = insightEngine.forEmployee(snapshot);
    const overdueTasks = snapshot.tasks.filter((task) => task.overdue && !task.submittedByCurrentUser).length;
    const overdueTraining = snapshot.training.filter((item) => item.overdue).length;
    return {
      context: scope.context,
      title: "AI 员工助手",
      description: "只读取你的团队任务、本人客户、本人培训与个人成长摘要。",
      greeting: "早上好，先把今天最重要的事情做成闭环。",
      summary: `你所在团队今天及此前有 ${snapshot.tasks.length} 个未关闭任务，${snapshot.customers.length} 个客户需要提醒，${snapshot.training.length} 个培训安排待完成。`,
      metrics: [
        { id: "tasks", label: "团队待办任务", value: String(snapshot.tasks.length), description: `${overdueTasks} 个已逾期且本人未提交`, tone: overdueTasks > 0 ? "rose" : "indigo" },
        { id: "customers", label: "本人客户提醒", value: String(snapshot.customers.length), description: "仅统计你负责且需要跟进的客户", tone: snapshot.customers.length > 0 ? "amber" : "emerald" },
        { id: "training", label: "待完成培训", value: String(snapshot.training.length), description: `${overdueTraining} 个已逾期`, tone: overdueTraining > 0 ? "rose" : "sky" },
        { id: "growth", label: "最近教练评分", value: snapshot.growth ? `${snapshot.growth.score} 分` : "暂无数据", description: "只读取你的最新 AI 教练报告", tone: snapshot.growth && snapshot.growth.score < 60 ? "rose" : "emerald" }
      ],
      sections: [
        {
          id: "tasks",
          title: "今日任务",
          description: "展示所在团队今天及此前未关闭的任务；任务模型暂未提供个人指派字段。",
          emptyMessage: "当前没有待处理团队任务。",
          items: snapshot.tasks.slice(0, 8).map((task) => ({
            id: task.id,
            type: "TASK",
            title: task.title,
            description: `${task.teamName} · ${dueLabel(task.deadline)}${task.submittedByCurrentUser ? " · 已有本人提交" : ""}`,
            priority: task.overdue ? "HIGH" : "MEDIUM",
            href: "/team-os/tasks/my"
          }))
        },
        {
          id: "customers",
          title: "客户提醒",
          description: "只展示你负责的客户，名称已脱敏。",
          emptyMessage: "当前没有需要提醒的本人客户。",
          items: snapshot.customers.slice(0, 8).map((customer) => ({
            id: customer.id,
            type: "CRM",
            title: `${customer.maskedName} 需要跟进`,
            description: customer.daysSinceFollowUp >= 999 ? "暂无跟进记录" : `${customer.daysSinceFollowUp} 天未跟进`,
            priority: customer.riskLevel === "HIGH" || customer.daysSinceFollowUp >= 7 ? "HIGH" : "MEDIUM",
            href: "/team-os/crm"
          }))
        },
        {
          id: "growth",
          title: "学习与成长建议",
          description: "结合本人培训安排与最新 AI 教练报告。",
          emptyMessage: "暂无新的个人成长建议。",
          items: [
            ...snapshot.training.slice(0, 5).map((item) => ({
              id: item.id,
              type: "TRAINING" as const,
              title: item.courseTitle,
              description: dueLabel(item.deadline),
              priority: item.overdue ? "HIGH" as const : "LOW" as const,
              href: "/team-os/training"
            })),
            ...(snapshot.growth ? [{
              id: "latest-growth",
              type: "TRAINING" as const,
              title: "AI 教练成长建议",
              description: snapshot.growth.trainingPlan || snapshot.growth.suggestions[0] || "根据最近报告进行针对性训练。",
              priority: snapshot.growth.score < 60 ? "HIGH" as const : "LOW" as const,
              href: "/team-os/ai-coach"
            }] : [])
          ].slice(0, 8)
        }
      ],
      insights,
      suggestedQuestions: ["我今天先做什么？", "哪些客户需要马上跟进？", "我应该练习哪项能力？"],
      generatedAt: new Date().toISOString()
    };
  }

  fallbackAnswer(dashboard: CopilotDashboardData, message: string) {
    return dashboardFallbackAnswer(dashboard, message);
  }
}
