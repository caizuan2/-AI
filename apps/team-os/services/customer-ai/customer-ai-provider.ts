import "server-only";

import { chatWithFallback, getProviderReadiness } from "@/lib/ai/providers";
import { AIError } from "@/lib/errors";
import type { ChatProviderName } from "@/lib/ai/types";
import {
  teamOsProductionLogger,
  toTeamOsSafeErrorMetadata
} from "@/apps/team-os/features/production/services/production-logger";
import {
  buildAnalyzeCustomerPrompt,
  buildFollowUpSuggestionPrompt
} from "@/apps/team-os/services/customer-ai/customer-ai-prompts";
import {
  CUSTOMER_INTENTS,
  CUSTOMER_RISK_LEVELS,
  type AnalyzeCustomerInput,
  type CustomerAiProvider,
  type CustomerAnalysisResult,
  type CustomerIntent,
  type CustomerRiskLevel,
  type FollowUpSuggestionResult,
  type GenerateFollowUpSuggestionInput
} from "@/apps/team-os/services/customer-ai/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const source = fenced?.[1] ?? trimmed;

  try {
    const parsed = JSON.parse(source) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("response is not an object");
    }
    return parsed;
  } catch {
    throw new AIError("AI CRM 返回了无法解析的 JSON，请重试。");
  }
}

function boundedString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AIError(`AI CRM 返回的${label}不完整，请重试。`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new AIError(`AI CRM 返回的${label}过长，请重试。`);
  }
  return result;
}

function painPoints(value: unknown) {
  if (!Array.isArray(value) || value.length > 10) {
    throw new AIError("AI CRM 返回的客户痛点格式不正确，请重试。");
  }
  return value.map((item) => boundedString(item, "客户痛点", 300));
}

function customerIntent(value: unknown): CustomerIntent {
  if (typeof value !== "string" || !CUSTOMER_INTENTS.includes(value as CustomerIntent)) {
    throw new AIError("AI CRM 返回的客户意向不正确，请重试。");
  }
  return value as CustomerIntent;
}

function riskLevel(value: unknown): CustomerRiskLevel {
  if (typeof value !== "string" || !CUSTOMER_RISK_LEVELS.includes(value as CustomerRiskLevel)) {
    throw new AIError("AI CRM 返回的风险等级不正确，请重试。");
  }
  return value as CustomerRiskLevel;
}

function probability(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new AIError("AI CRM 返回的成交概率必须是 0 到 100 的整数。");
  }
  return value;
}

function customerFacingScript(value: unknown) {
  const result = boundedString(value, "推荐话术", 800);
  if (/\b(?:tenant(?:_?id)?|company(?:_?id)?|chunk(?:_?id)?|knowledgebase(?:_?id)?)\b|知识库|系统提示|标准\s*ID/i.test(result)) {
    throw new AIError("AI CRM 返回的推荐话术包含内部实现信息，请重试。");
  }
  return result;
}

export function parseCustomerAnalysisResponse(text: string): CustomerAnalysisResult {
  const result = parseJsonObject(text);
  return {
    intent: customerIntent(result.intent),
    painPoints: painPoints(result.painPoints),
    riskLevel: riskLevel(result.riskLevel),
    purchaseProbability: probability(result.purchaseProbability),
    nextAction: boundedString(result.nextAction, "下一步行动", 1_000)
  };
}

export function parseFollowUpSuggestionResponse(text: string): FollowUpSuggestionResult {
  const result = parseJsonObject(text);
  return {
    suggestion: boundedString(result.suggestion, "跟进建议", 1_200),
    recommendedScript: customerFacingScript(result.recommendedScript)
  };
}

function providerChain(requested?: ChatProviderName) {
  const readiness = getProviderReadiness();
  const candidates = Array.from(new Set(
    requested ? [requested, ...readiness.providerChain] : readiness.providerChain
  ));
  const configured = candidates.filter((provider) => (
    provider === "qwen"
      ? readiness.qwenConfigured
      : provider === "deepseek"
        ? readiness.deepseekConfigured
        : readiness.openaiConfigured
  ));

  // Do not let an unconfigured trailing fallback hide a real provider failure.
  // If none are configured, keep one candidate so the shared gateway returns
  // its standard missing-key error.
  return configured.length > 0 ? configured : candidates.slice(0, 1);
}

async function runWithValidatedFallback<T>(input: {
  operation: "analyze_customer" | "generate_follow_up_suggestion";
  provider?: ChatProviderName;
  requestId?: string;
  prompt: { system: string; user: string };
  maxTokens: number;
  parse: (text: string) => T;
}): Promise<T> {
  let lastError: unknown = null;

  for (const provider of providerChain(input.provider)) {
    try {
      const response = await chatWithFallback({
        provider,
        providerChain: [provider],
        system: input.prompt.system,
        messages: [{ role: "user", content: input.prompt.user }],
        temperature: 0.1,
        maxTokens: input.maxTokens,
        requestId: input.requestId
      });
      const parsed = input.parse(response.text);
      teamOsProductionLogger.info("ai_call", {
        module: "AI",
        requestId: input.requestId
      }, {
        operation: input.operation,
        provider,
        outcome: "success"
      });
      return parsed;
    } catch (error) {
      lastError = error;
      teamOsProductionLogger.warn("ai_call", {
        module: "AI",
        requestId: input.requestId
      }, {
        operation: input.operation,
        provider,
        outcome: "failed",
        error: toTeamOsSafeErrorMetadata(error)
      });
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new AIError("AI CRM 暂时无法生成有效结果，请稍后重试。");
}

class GatewayCustomerAiProvider implements CustomerAiProvider {
  analyzeCustomer(input: AnalyzeCustomerInput) {
    return runWithValidatedFallback({
      operation: "analyze_customer",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildAnalyzeCustomerPrompt(input),
      maxTokens: 1_200,
      parse: parseCustomerAnalysisResponse
    });
  }

  generateFollowUpSuggestion(input: GenerateFollowUpSuggestionInput) {
    return runWithValidatedFallback({
      operation: "generate_follow_up_suggestion",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildFollowUpSuggestionPrompt(input),
      maxTokens: 900,
      parse: parseFollowUpSuggestionResponse
    });
  }
}

export function createDefaultCustomerAiProvider(): CustomerAiProvider {
  return new GatewayCustomerAiProvider();
}
