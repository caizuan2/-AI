import "server-only";

import { chatWithFallback, getProviderReadiness } from "@/lib/ai/providers";
import type { ChatProviderName } from "@/lib/ai/types";
import { logger } from "@/lib/logger";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";
import type { CopilotAgent } from "@/apps/team-os/features/copilot/agents/types";
import type {
  CopilotChatMessage,
  CopilotDashboardData
} from "@/apps/team-os/features/copilot/types";

function providerChain() {
  const readiness = getProviderReadiness();
  return Array.from(new Set(readiness.providerChain)).filter((provider): provider is ChatProviderName => (
    provider === "qwen"
      ? readiness.qwenConfigured
      : provider === "deepseek"
        ? readiness.deepseekConfigured
        : readiness.openaiConfigured
  ));
}

function safeDashboardContext(dashboard: CopilotDashboardData) {
  return JSON.stringify({
    scope: dashboard.context.scopeMode,
    companyName: dashboard.context.companyName,
    summary: dashboard.summary,
    metrics: dashboard.metrics.map((metric) => ({
      label: metric.label,
      value: metric.value,
      description: metric.description
    })),
    sections: dashboard.sections.map((section) => ({
      title: section.title,
      items: section.items.slice(0, 10).map((item) => ({
        type: item.type,
        title: item.title,
        description: item.description,
        priority: item.priority
      }))
    })),
    insights: dashboard.insights.slice(0, 10).map((insight) => ({
      type: insight.type,
      title: insight.title,
      content: insight.content,
      recommendation: insight.recommendation,
      priority: insight.priority
    }))
  });
}

function safeAnswer(value: string) {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!normalized || normalized.length > 3_000) {
    throw new Error("Copilot answer length is invalid.");
  }
  if (/系统提示|忽略以上指令|API[_ -]?KEY|SESSION_SECRET|DATABASE_URL/i.test(normalized)) {
    throw new Error("Copilot answer contains protected implementation details.");
  }
  return normalized;
}

export async function generateCopilotAnswer(input: {
  agent: CopilotAgent;
  dashboard: CopilotDashboardData;
  history: CopilotChatMessage[];
  message: string;
  requestId?: string;
}) {
  const chain = providerChain();
  if (chain.length > 0) {
    try {
      const response = await chatWithFallback({
        provider: chain[0],
        providerChain: chain,
        system: `${input.agent.systemPrompt}\n\n当前结构化数据摘要：\n${safeDashboardContext(input.dashboard)}`,
        messages: [
          ...input.history.slice(-6).map((message) => ({
            role: message.role,
            content: message.content
          })),
          { role: "user" as const, content: input.message }
        ],
        temperature: 0.2,
        maxTokens: 1_000,
        requestId: input.requestId
      });
      return {
        answer: safeAnswer(response.text),
        provider: response.provider,
        fallbackUsed: response.fallbackUsed
      };
    } catch (error) {
      logger.warn("team_os_copilot_provider_failed", {
        requestId: input.requestId,
        assistantRole: input.agent.role,
        error: toTeamOsSafeErrorMetadata(error)
      });
    }
  }
  return {
    answer: input.agent.fallbackAnswer(input.dashboard, input.message),
    provider: "rules",
    fallbackUsed: true
  };
}
