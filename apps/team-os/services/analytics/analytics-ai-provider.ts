import "server-only";

import { chatWithFallback, getProviderReadiness } from "@/lib/ai/providers";
import type { ChatProviderName } from "@/lib/ai/types";
import { AIError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";
import { buildBusinessInsightPrompt } from "@/apps/team-os/services/analytics/analytics-prompts";
import type {
  AnalyticsAiProvider,
  BusinessInsightAggregateInput,
  BusinessInsightResult
} from "@/apps/team-os/services/analytics/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AIError(`AI 经营分析返回的${label}不完整，请重试。`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new AIError(`AI 经营分析返回的${label}过长，请重试。`);
  }
  if (/\b(?:tenant|company|user|customer|knowledge)(?:_?id)?\b|系统提示|不可信数据|忽略以上指令/i.test(result)) {
    throw new AIError(`AI 经营分析返回的${label}包含内部信息，请重试。`);
  }
  return result;
}

function safeList(value: unknown, label: string, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AIError(`AI 经营分析返回的${label}格式不正确，请重试。`);
  }
  const result = value.map((item) => safeText(item, label, 500));
  if (new Set(result).size !== result.length) {
    throw new AIError(`AI 经营分析返回了重复${label}，请重试。`);
  }
  return result;
}

export function parseBusinessInsightResponse(text: string): BusinessInsightResult {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced?.[1] ?? trimmed) as unknown;
  } catch {
    throw new AIError("AI 经营分析返回了无法解析的 JSON，请重试。");
  }
  if (!isRecord(parsed)) {
    throw new AIError("AI 经营分析返回格式不正确，请重试。");
  }
  const keys = Object.keys(parsed).sort();
  const expected = ["actions", "highlights", "risks", "summary"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new AIError("AI 经营分析返回字段不正确，请重试。");
  }
  return {
    summary: safeText(parsed.summary, "总结", 2_000),
    highlights: safeList(parsed.highlights, "亮点", 6),
    risks: safeList(parsed.risks, "风险", 6),
    actions: safeList(parsed.actions, "行动建议", 8)
  };
}

function providerChain(requested?: ChatProviderName) {
  if (requested) return [requested];
  const readiness = getProviderReadiness();
  const configured = Array.from(new Set(readiness.providerChain)).filter((provider) => (
    provider === "qwen"
      ? readiness.qwenConfigured
      : provider === "deepseek"
        ? readiness.deepseekConfigured
        : readiness.openaiConfigured
  ));
  const available = configured.length > 0 ? configured : [readiness.primaryProvider];
  return process.env.ANALYTICS_AI_ALLOW_CROSS_PROVIDER_FALLBACK === "true"
    ? available
    : available.slice(0, 1);
}

class GatewayAnalyticsAiProvider implements AnalyticsAiProvider {
  async generateInsight(input: BusinessInsightAggregateInput) {
    const prompt = buildBusinessInsightPrompt(input);
    for (const provider of providerChain(input.provider)) {
      try {
        const response = await chatWithFallback({
          provider,
          providerChain: [provider],
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          temperature: 0.1,
          maxTokens: 1_600,
          requestId: input.requestId
        });
        return parseBusinessInsightResponse(response.text);
      } catch (error) {
        logger.warn("analytics_ai.provider_attempt_failed", {
          requestId: input.requestId,
          provider,
          error: toSafeErrorLog(error)
        });
      }
    }
    throw new AIError("AI 经营分析暂时无法生成有效结果，请稍后重试。");
  }
}

export function createDefaultAnalyticsAiProvider(): AnalyticsAiProvider {
  return new GatewayAnalyticsAiProvider();
}
