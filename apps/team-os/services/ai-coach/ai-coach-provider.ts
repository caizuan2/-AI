import "server-only";

import { chatWithFallback, getProviderReadiness } from "@/lib/ai/providers";
import { AIError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  buildSalesCoachAnalysisPrompt,
  type SalesCoachPromptRule,
  type SalesCoachPromptStandard
} from "@/apps/team-os/features/industry-coach/prompts/sales-coach-analysis";
import { INDUSTRY_COACH_PROFILE } from "@/apps/team-os/features/industry-coach/utils/industry-coach-profile";
import type {
  CoachAnalysisResult,
  CoachMatchedStandard,
  CoachProviderName,
  CoachSkillKey,
  CoachSkillScore
} from "@/apps/team-os/features/ai-coach/types";

const SKILL_DEFINITIONS: ReadonlyArray<{
  key: CoachSkillKey;
  label: string;
  criteria: string;
}> = INDUSTRY_COACH_PROFILE.map((dimension) => ({
  key: dimension.key,
  label: dimension.label,
  criteria: dimension.criteria.join("；")
}));

export interface AiCoachProviderInput {
  conversation: string;
  knowledgeContext: string;
  industryStandards: SalesCoachPromptStandard[];
  coachRules: SalesCoachPromptRule[];
  screenshotCount: number;
  screenshotOrigins: string[];
  provider?: CoachProviderName;
  requestId?: string;
}

export interface AiCoachProvider {
  analyze(input: AiCoachProviderInput): Promise<CoachAnalysisResult>;
}

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
    throw new AIError("AI 教练返回了无法解析的 JSON，请重新分析。");
  }
}

function boundedString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AIError(`AI 教练返回的${label}不完整，请重新分析。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new AIError(`AI 教练返回的${label}过长，请重新分析。`);
  }
  return result;
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 12) {
    throw new AIError(`AI 教练返回的${label}格式不正确，请重新分析。`);
  }

  return value.map((item) => boundedString(item, label, 500));
}

function scoreLevel(score: number) {
  if (score >= 18) return "优秀";
  if (score >= 14) return "良好";
  if (score >= 8) return "发展中";
  return "需提升";
}

function parseSkillScores(value: unknown): CoachSkillScore[] {
  if (!isRecord(value)) {
    throw new AIError("AI 教练返回的技能评分格式不正确，请重新分析。");
  }

  return SKILL_DEFINITIONS.map(({ key, label }) => {
    const rawScore = value[key];
    if (typeof rawScore !== "number" || !Number.isInteger(rawScore) || rawScore < 0 || rawScore > 20) {
      throw new AIError(`${label}评分必须是 0 到 20 的整数。`);
    }

    return {
      key,
      label,
      score: rawScore,
      maxScore: 20,
      level: scoreLevel(rawScore)
    };
  });
}

function parseMatchedStandards(
  value: unknown,
  standards: SalesCoachPromptStandard[]
): CoachMatchedStandard[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new AIError("AI 教练返回的标准匹配格式不正确，请重新分析。");
  }

  const standardById = new Map(standards.map((standard) => [standard.id, standard]));
  const seen = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new AIError("AI 教练返回的标准匹配格式不正确，请重新分析。");
    }
    const standardId = boundedString(item.standardId, "标准 ID", 160);
    const standard = standardById.get(standardId);
    if (!standard || seen.has(standardId)) {
      throw new AIError("AI 教练引用了未提供或重复的企业标准，请重新分析。");
    }
    seen.add(standardId);

    return {
      standardId,
      category: standard.category,
      title: standard.title,
      version: standard.version,
      evidence: boundedString(item.evidence, "标准匹配证据", 1_000),
      gap: boundedString(item.gap, "标准差距", 1_000)
    };
  });
}

export function parseAiCoachProviderResponse(
  text: string,
  standards: SalesCoachPromptStandard[] = []
): CoachAnalysisResult {
  const result = parseJsonObject(text);
  const skills = parseSkillScores(result.skills);
  const score = skills.reduce((sum, skill) => sum + skill.score, 0);

  return {
    score,
    industryScore: score,
    summary: boundedString(result.summary, "分析摘要", 2_000),
    problems: stringList(result.problems, "问题列表"),
    suggestions: stringList(result.suggestions, "建议列表"),
    trainingPlan: boundedString(result.trainingPlan, "训练计划", 2_000),
    matchedStandards: parseMatchedStandards(result.matchedStandards, standards),
    coachFeedback: boundedString(result.coachFeedback, "教练反馈", 2_000),
    improvementPlan: boundedString(result.improvementPlan, "改进计划", 2_000),
    skills
  };
}

class GatewayAiCoachProvider implements AiCoachProvider {
  async analyze(input: AiCoachProviderInput) {
    const defaultChain = getProviderReadiness().providerChain;
    const providerChain = Array.from(new Set(input.provider
      ? [input.provider, ...defaultChain]
      : defaultChain));
    let lastError: unknown = null;

    for (const provider of providerChain) {
      try {
        const prompt = buildSalesCoachAnalysisPrompt({
          conversation: input.conversation,
          screenshotCount: input.screenshotCount,
          screenshotOrigins: input.screenshotOrigins,
          knowledgeContext: input.knowledgeContext,
          standards: input.industryStandards,
          coachRules: input.coachRules
        });
        const response = await chatWithFallback({
          provider,
          providerChain: [provider],
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          temperature: 0.1,
          maxTokens: 1_800,
          requestId: input.requestId
        });

        return parseAiCoachProviderResponse(response.text, input.industryStandards);
      } catch (error) {
        lastError = error;
        logger.warn("ai_coach.provider_attempt_failed", {
          requestId: input.requestId,
          provider,
          error: toSafeErrorLog(error)
        });
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new AIError("AI 教练暂时无法生成有效报告，请稍后重试。");
  }
}

export function createDefaultAiCoachProvider(): AiCoachProvider {
  return new GatewayAiCoachProvider();
}
