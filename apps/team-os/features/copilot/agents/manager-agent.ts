import { MANAGER_COPILOT_SYSTEM_PROMPT } from "@/apps/team-os/features/copilot/prompts/manager-prompt";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";
import { loadManagerCopilotSnapshot } from "@/apps/team-os/features/copilot/services/copilot-repository";
import { insightEngine } from "@/apps/team-os/features/copilot/services/insight-engine";
import type { CopilotDashboardData } from "@/apps/team-os/features/copilot/types";
import { metricText, percentageValue } from "@/apps/team-os/features/copilot/utils/copilot-format";
import { dashboardFallbackAnswer, type CopilotAgent } from "@/apps/team-os/features/copilot/agents/types";

export class ManagerAgent implements CopilotAgent {
  readonly role = "MANAGER_ASSISTANT" as const;
  readonly systemPrompt = MANAGER_COPILOT_SYSTEM_PROMPT;

  async buildDashboard(scope: CopilotAccessScope): Promise<CopilotDashboardData> {
    const snapshot = await loadManagerCopilotSnapshot(scope);
    const insights = insightEngine.forManager(snapshot);
    const completionRate = percentageValue(snapshot.taskCompleted, snapshot.taskTotal);
    const attentionMembers = snapshot.members.filter((member) => (
      member.submissionCount === 0 || (member.coachScore !== undefined && member.coachScore < 60)
    ));
    return {
      context: scope.context,
      title: "AI 主管助手",
      description: "只读取你直接管理团队的任务、成员、客户风险和培训聚合数据。",
      greeting: "团队日报已经整理好，先处理高风险事项。",
      summary: `今日团队任务完成率 ${metricText(completionRate)}，有 ${attentionMembers.length} 名成员需要关注、${snapshot.customerRisks.length} 个高风险客户。`,
      metrics: [
        { id: "completion", label: "今日完成率", value: metricText(completionRate), description: `${snapshot.taskCompleted}/${snapshot.taskTotal} 个今日任务已完成`, tone: completionRate !== null && completionRate < 70 ? "rose" : "emerald" },
        { id: "overdue", label: "逾期任务", value: String(snapshot.overdueTaskCount), description: "仅统计直接管理团队", tone: snapshot.overdueTaskCount > 0 ? "rose" : "indigo" },
        { id: "members", label: "异常成员", value: String(attentionMembers.length), description: "最近提交不足或教练评分偏低", tone: attentionMembers.length > 0 ? "amber" : "emerald" },
        { id: "crm", label: "高风险客户", value: String(snapshot.customerRisks.length), description: "客户名称已脱敏", tone: snapshot.customerRisks.length > 0 ? "rose" : "sky" },
        { id: "training", label: "待完成培训", value: String(snapshot.openTrainingCount), description: `${snapshot.overdueTrainingCount} 个已逾期`, tone: snapshot.overdueTrainingCount > 0 ? "amber" : "sky" }
      ],
      sections: [
        {
          id: "members",
          title: "异常员工",
          description: "只分析直接管理团队，依据最近 3 天任务提交和最近教练评分。",
          emptyMessage: "当前没有需要重点辅导的成员。",
          items: attentionMembers.slice(0, 10).map((member) => ({
            id: `${member.teamId}:${member.userId}`,
            type: "TEAM",
            title: member.employeeName,
            description: `${member.teamName} · 最近提交 ${member.submissionCount} 次${member.coachScore !== undefined ? ` · 教练评分 ${member.coachScore}` : ""}`,
            priority: member.submissionCount === 0 && (member.coachScore ?? 100) < 60 ? "HIGH" : "MEDIUM",
            href: "/team-os/ai-coach/team"
          }))
        },
        {
          id: "crm",
          title: "客户风险",
          description: "当前直接管理团队内的高风险客户。",
          emptyMessage: "当前没有高风险客户。",
          items: snapshot.customerRisks.slice(0, 10).map((customer) => ({
            id: customer.id,
            type: "CRM",
            title: customer.maskedName,
            description: `${customer.ownerName} 负责 · ${customer.daysSinceFollowUp >= 999 ? "暂无跟进记录" : `${customer.daysSinceFollowUp} 天未跟进`}`,
            priority: "HIGH",
            href: "/team-os/crm"
          }))
        },
        {
          id: "training",
          title: "培训建议",
          description: "根据团队异常与逾期培训生成管理建议。",
          emptyMessage: "当前没有新的培训风险。",
          items: snapshot.overdueTrainingCount > 0 ? [{
            id: "overdue-training",
            type: "TRAINING",
            title: "安排团队补训",
            description: `${snapshot.overdueTrainingCount} 个培训安排已逾期，建议结合实际能力短板重新排期。`,
            priority: snapshot.overdueTrainingCount >= 3 ? "HIGH" : "MEDIUM",
            href: "/team-os/training/manage"
          }] : []
        }
      ],
      insights,
      suggestedQuestions: ["生成今天的团队日报", "谁需要优先辅导？", "有哪些客户风险？"],
      generatedAt: new Date().toISOString()
    };
  }

  fallbackAnswer(dashboard: CopilotDashboardData, message: string) {
    return dashboardFallbackAnswer(dashboard, message);
  }
}
