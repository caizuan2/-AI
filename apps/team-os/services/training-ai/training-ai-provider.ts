import "server-only";

import { chatWithFallback, getProviderReadiness } from "@/lib/ai/providers";
import { AIError } from "@/lib/errors";
import type { ChatProviderName } from "@/lib/ai/types";
import { logger } from "@/lib/logger";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";
import {
  normalizeTrainingCourseContentInput,
  normalizeTrainingEvaluationInput,
  normalizeTrainingRecommendationInput,
  normalizeTrainingSimulationInput
} from "@/apps/team-os/services/training-ai/training-ai-input";
import {
  buildEvaluateTrainingPrompt,
  buildRecommendTrainingPrompt,
  buildTrainingCourseContentPrompt,
  buildTrainingSimulationPrompt
} from "@/apps/team-os/services/training-ai/training-ai-prompts";
import {
  TRAINING_RECOMMENDATION_PRIORITIES,
  type GenerateTrainingCourseContentInput,
  type GenerateTrainingSimulationInput,
  type TrainingAiProvider,
  type TrainingCourseContentResult,
  type TrainingCourseRecommendation,
  type TrainingEvaluationInput,
  type TrainingEvaluationResult,
  type TrainingRecommendationInput,
  type TrainingRecommendationPriority,
  type TrainingRecommendationResult,
  type TrainingSimulationResult
} from "@/apps/team-os/services/training-ai/types";

type TrainingAiOperation =
  | "evaluate_training"
  | "recommend_training"
  | "generate_training_simulation"
  | "generate_training_course_content";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const source = fenced?.[1] ?? trimmed;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!isRecord(parsed)) throw new Error("response is not an object");
    return parsed;
  } catch {
    throw new AIError("AI 培训服务返回了无法解析的 JSON，请重试。");
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AIError(`AI 培训服务返回的${label}字段不正确，请重试。`);
  }
}

function boundedString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AIError(`AI 培训服务返回的${label}不完整，请重试。`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new AIError(`AI 培训服务返回的${label}过长，请重试。`);
  }
  return result;
}

function safeOutputString(value: unknown, label: string, maxLength: number) {
  const result = boundedString(value, label, maxLength);
  if (/\b(?:tenant|company|chunk|knowledgebase)(?:_?id)?\b|系统提示|user payload|不可信数据|忽略以上指令/i.test(result)) {
    throw new AIError(`AI 培训服务返回的${label}包含内部信息，请重试。`);
  }
  return result;
}

function boundedStringList(
  value: unknown,
  label: string,
  options: { maxItems: number; maxLength: number; allowEmpty?: boolean }
) {
  if (
    !Array.isArray(value) ||
    value.length > options.maxItems ||
    (!options.allowEmpty && value.length === 0)
  ) {
    throw new AIError(`AI 培训服务返回的${label}格式不正确，请重试。`);
  }
  const result = value.map((item) => safeOutputString(item, label, options.maxLength));
  if (new Set(result).size !== result.length) {
    throw new AIError(`AI 培训服务返回了重复${label}，请重试。`);
  }
  return result;
}

function integerScore(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new AIError("AI 培训评分必须是 0 到 100 的整数。");
  }
  return value;
}

function recommendationPriority(value: unknown): TrainingRecommendationPriority {
  if (
    typeof value !== "string" ||
    !TRAINING_RECOMMENDATION_PRIORITIES.includes(value as TrainingRecommendationPriority)
  ) {
    throw new AIError("AI 培训服务返回的推荐优先级不正确，请重试。");
  }
  return value as TrainingRecommendationPriority;
}

export function parseTrainingEvaluationResponse(text: string): TrainingEvaluationResult {
  const result = parseJsonObject(text);
  assertExactKeys(result, ["score", "feedback", "suggestions"], "训练评分");
  return {
    score: integerScore(result.score),
    feedback: safeOutputString(result.feedback, "训练反馈", 2_000),
    suggestions: boundedStringList(result.suggestions, "训练建议", {
      maxItems: 8,
      maxLength: 500,
      allowEmpty: true
    })
  };
}

function parseRecommendationItem(
  value: unknown,
  input: TrainingRecommendationInput
): TrainingCourseRecommendation {
  if (!isRecord(value)) {
    throw new AIError("AI 培训服务返回的课程推荐格式不正确，请重试。");
  }
  assertExactKeys(value, ["courseId", "title", "reason", "priority", "focusAreas"], "课程推荐");
  const catalog = new Map((input.courses ?? []).map((course) => [course.id, course]));
  let courseId: string | null;
  let title: string;

  if (catalog.size > 0) {
    courseId = boundedString(value.courseId, "推荐课程 ID", 160);
    const course = catalog.get(courseId);
    if (!course) {
      throw new AIError("AI 培训服务推荐了未提供的课程，请重试。");
    }
    title = safeOutputString(value.title, "推荐课程标题", 160);
    if (title !== course.title) {
      throw new AIError("AI 培训服务返回的课程标题与课程不一致，请重试。");
    }
  } else {
    if (value.courseId !== null) {
      throw new AIError("无候选课程时推荐课程 ID 必须为空。");
    }
    courseId = null;
    title = safeOutputString(value.title, "推荐课程主题", 160);
  }

  return {
    courseId,
    title,
    reason: safeOutputString(value.reason, "推荐原因", 1_200),
    priority: recommendationPriority(value.priority),
    focusAreas: boundedStringList(value.focusAreas, "训练重点", {
      maxItems: 6,
      maxLength: 240
    })
  };
}

export function parseTrainingRecommendationResponse(
  text: string,
  input: TrainingRecommendationInput
): TrainingRecommendationResult {
  const result = parseJsonObject(text);
  assertExactKeys(result, ["summary", "recommendations"], "培训推荐");
  if (!Array.isArray(result.recommendations) || result.recommendations.length === 0 || result.recommendations.length > 6) {
    throw new AIError("AI 培训服务返回的课程推荐数量不正确，请重试。");
  }
  const recommendations = result.recommendations.map((item) => parseRecommendationItem(item, input));
  const keys = recommendations.map((item) => item.courseId ?? item.title.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) {
    throw new AIError("AI 培训服务返回了重复课程推荐，请重试。");
  }
  return {
    summary: safeOutputString(result.summary, "推荐摘要", 2_000),
    recommendations
  };
}

export function parseTrainingSimulationResponse(text: string): TrainingSimulationResult {
  const result = parseJsonObject(text);
  assertExactKeys(result, ["question", "standard"], "模拟训练");
  return {
    question: safeOutputString(result.question, "模拟训练问题", 3_000),
    standard: safeOutputString(result.standard, "模拟训练评分标准", 8_000)
  };
}

export function parseTrainingCourseContentResponse(text: string): TrainingCourseContentResult {
  const result = parseJsonObject(text);
  assertExactKeys(result, ["description", "content"], "课程内容");
  return {
    description: safeOutputString(result.description, "课程简介", 1_200),
    content: safeOutputString(result.content, "课程正文", 30_000)
  };
}

function providerChain(requested?: ChatProviderName) {
  const readiness = getProviderReadiness();
  if (requested) return [requested];
  const candidates = Array.from(new Set(
    readiness.providerChain
  ));
  const configured = candidates.filter((provider) => (
    provider === "qwen"
      ? readiness.qwenConfigured
      : provider === "deepseek"
        ? readiness.deepseekConfigured
        : readiness.openaiConfigured
  ));
  const available = configured.length > 0 ? configured : candidates.slice(0, 1);
  return process.env.TRAINING_AI_ALLOW_CROSS_PROVIDER_FALLBACK === "true"
    ? available
    : available.slice(0, 1);
}

async function runWithValidatedFallback<T>(input: {
  operation: TrainingAiOperation;
  provider?: ChatProviderName;
  requestId?: string;
  prompt: { system: string; user: string };
  maxTokens: number;
  parse: (text: string) => T;
}): Promise<T> {
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
      return input.parse(response.text);
    } catch (error) {
      logger.warn("training_ai.provider_attempt_failed", {
        requestId: input.requestId,
        operation: input.operation,
        provider,
        error: toTeamOsSafeErrorMetadata(error)
      });
    }
  }
  throw new AIError("AI 培训服务暂时无法生成有效结果，请稍后重试。");
}

class GatewayTrainingAiProvider implements TrainingAiProvider {
  evaluate(rawInput: TrainingEvaluationInput) {
    const input = normalizeTrainingEvaluationInput(rawInput);
    return runWithValidatedFallback({
      operation: "evaluate_training",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildEvaluateTrainingPrompt(input),
      maxTokens: 1_200,
      parse: parseTrainingEvaluationResponse
    });
  }

  recommend(rawInput: TrainingRecommendationInput) {
    const input = normalizeTrainingRecommendationInput(rawInput);
    return runWithValidatedFallback({
      operation: "recommend_training",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildRecommendTrainingPrompt(input),
      maxTokens: 1_800,
      parse: (text) => parseTrainingRecommendationResponse(text, input)
    });
  }

  generateSimulation(rawInput: GenerateTrainingSimulationInput) {
    const input = normalizeTrainingSimulationInput(rawInput);
    return runWithValidatedFallback({
      operation: "generate_training_simulation",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildTrainingSimulationPrompt(input),
      maxTokens: 1_600,
      parse: parseTrainingSimulationResponse
    });
  }

  generateCourseContent(rawInput: GenerateTrainingCourseContentInput) {
    const input = normalizeTrainingCourseContentInput(rawInput);
    return runWithValidatedFallback({
      operation: "generate_training_course_content",
      provider: input.provider,
      requestId: input.requestId,
      prompt: buildTrainingCourseContentPrompt(input),
      maxTokens: 4_000,
      parse: parseTrainingCourseContentResponse
    });
  }
}

export function createDefaultTrainingAiProvider(): TrainingAiProvider {
  return new GatewayTrainingAiProvider();
}
