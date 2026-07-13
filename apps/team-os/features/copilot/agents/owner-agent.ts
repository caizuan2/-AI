import { OWNER_COPILOT_SYSTEM_PROMPT } from "@/apps/team-os/features/copilot/prompts/owner-prompt";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";
import { loadOwnerCopilotSnapshot } from "@/apps/team-os/features/copilot/services/copilot-repository";
import { insightEngine } from "@/apps/team-os/features/copilot/services/insight-engine";
import type { CopilotDashboardData } from "@/apps/team-os/features/copilot/types";
import { metricText } from "@/apps/team-os/features/copilot/utils/copilot-format";
import { dashboardFallbackAnswer, type CopilotAgent } from "@/apps/team-os/features/copilot/agents/types";

export class OwnerAgent implements CopilotAgent {
  readonly role = "OWNER_ASSISTANT" as const;
  readonly systemPrompt = OWNER_COPILOT_SYSTEM_PROMPT;

  async buildDashboard(scope: CopilotAccessScope): Promise<CopilotDashboardData> {
    const snapshot = await loadOwnerCopilotSnapshot(scope);
    const insights = insightEngine.forOwner(snapshot);
    return {
      context: scope.context,
      title: "AI 老板助手",
      description: "只读取当前明确选择企业的经营聚合数据，不合并其他租户。",
      greeting: "企业经营摘要已经生成，以下是当前最重要的结果和风险。",
      summary: `近 30 天任务完成率 ${metricText(snapshot.taskCompletionRate)}，客户成交占比 ${metricText(snapshot.customerConversionRate)}，培训完成率 ${metricText(snapshot.trainingCompletionRate)}。`,
      metrics: [
        { id: "task", label: "任务完成率", value: metricText(snapshot.taskCompletionRate), description: "近 30 天企业任务", tone: snapshot.taskCompletionRate !== null && snapshot.taskCompletionRate < 70 ? "rose" : "emerald" },
        { id: "employee", label: "员工能力分", value: snapshot.employeeAverageScore === null ? "暂无数据" : `${Math.round(snapshot.employeeAverageScore)} 分`, description: `${snapshot.attentionEmployeeCount} 名员工需关注`, tone: snapshot.employeeAverageScore !== null && snapshot.employeeAverageScore < 60 ? "rose" : "indigo" },
        { id: "crm", label: "客户成交占比", value: metricText(snapshot.customerConversionRate), description: `${snapshot.riskCustomerCount}/${snapshot.customerCount} 个客户为高风险`, tone: snapshot.riskCustomerCount > 0 ? "amber" : "emerald" },
        { id: "training", label: "培训完成率", value: metricText(snapshot.trainingCompletionRate), description: `${snapshot.openTrainingCount} 个培训安排未完成`, tone: snapshot.trainingCompletionRate !== null && snapshot.trainingCompletionRate < 60 ? "rose" : "sky" },
        { id: "ai", label: "可追踪 AI 产出", value: String(snapshot.trackedAiOutputCount), description: snapshot.aiUsageCount === null ? "模型调用总量暂不可用" : `AI 调用 ${snapshot.aiUsageCount} 次`, tone: "indigo" }
      ],
      sections: [
        {
          id: "risks",
          title: "经营风险",
          description: "基于任务、团队、CRM 和培训聚合指标自动发现。",
          emptyMessage: "当前未发现低于健康线的经营指标。",
          items: insights.map((insight) => ({
            id: insight.sourceKey,
            type: insight.type,
            title: insight.title,
            description: insight.content,
            priority: insight.priority,
            href: insight.href
          }))
        },
        {
          id: "actions",
          title: "优先行动",
          description: "建议由对应主管落实并设置可验证节点。",
          emptyMessage: "当前没有新的高优先级行动。",
          items: insights.map((insight) => ({
            id: `action:${insight.sourceKey}`,
            type: insight.type,
            title: insight.title,
            description: insight.recommendation,
            priority: insight.priority,
            href: insight.href
          }))
        }
      ],
      insights,
      suggestedQuestions: ["公司最近情况如何？", "当前最大的经营风险是什么？", "本周优先推进哪三件事？"],
      generatedAt: new Date().toISOString()
    };
  }

  fallbackAnswer(dashboard: CopilotDashboardData, message: string) {
    return dashboardFallbackAnswer(dashboard, message);
  }
}
