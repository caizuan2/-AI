import type { CopilotDashboardData } from "@/apps/team-os/features/copilot/types";
import type { CopilotAccessScope } from "@/apps/team-os/features/copilot/services/copilot-access";

export interface CopilotAgent {
  readonly role: "EMPLOYEE_ASSISTANT" | "MANAGER_ASSISTANT" | "OWNER_ASSISTANT";
  readonly systemPrompt: string;
  buildDashboard(scope: CopilotAccessScope): Promise<CopilotDashboardData>;
  fallbackAnswer(dashboard: CopilotDashboardData, message: string): string;
}

export function dashboardFallbackAnswer(dashboard: CopilotDashboardData, message: string) {
  const requestedRisks = /风险|问题|异常|关注/.test(message);
  const requestedActions = /怎么|建议|行动|安排|计划/.test(message);
  const insights = dashboard.insights.slice(0, 3);
  if (requestedRisks && insights.length > 0) {
    return `当前最需要关注：${insights.map((item) => `${item.title}（${item.content}）`).join("；")}。`;
  }
  if (requestedActions && insights.length > 0) {
    return `建议优先执行：${insights.map((item, index) => `${index + 1}. ${item.recommendation}`).join(" ")}`;
  }
  return `${dashboard.summary}${insights[0] ? ` 当前优先动作：${insights[0].recommendation}` : " 当前没有发现需要立即处理的高优先级异常。"}`;
}
