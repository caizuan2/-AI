import "server-only";

import { ValidationError } from "@/lib/errors";
import {
  TRAINING_COURSE_CATEGORIES,
  TRAINING_COURSE_LEVELS,
  TRAINING_CUSTOMER_INTENTS,
  TRAINING_CUSTOMER_RISK_LEVELS,
  type GenerateTrainingCourseContentInput,
  type GenerateTrainingSimulationInput,
  type TrainingCourseReference,
  type TrainingCrmMetrics,
  type TrainingEvaluationInput,
  type TrainingRecommendationInput,
  type TrainingReportMetrics,
  type TrainingSkillMetric
} from "@/apps/team-os/services/training-ai/types";

function boundedText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }
  const result = value.replace(/\s+/g, " ").trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return boundedText(value, label, maxLength);
}

function boundedScore(value: unknown, label: string, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new ValidationError(`${label}必须是 0 到 ${maximum} 之间的数字。`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw new ValidationError(`${label}必须是 0 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function category(value: unknown) {
  if (typeof value !== "string" || !TRAINING_COURSE_CATEGORIES.includes(value as never)) {
    throw new ValidationError("课程分类不正确。");
  }
  return value as (typeof TRAINING_COURSE_CATEGORIES)[number];
}

function level(value: unknown) {
  if (typeof value !== "string" || !TRAINING_COURSE_LEVELS.includes(value as never)) {
    throw new ValidationError("课程难度不正确。");
  }
  return value as (typeof TRAINING_COURSE_LEVELS)[number];
}

function normalizeSkillMetric(value: TrainingSkillMetric): TrainingSkillMetric {
  return {
    skill: boundedText(value.skill, "技能名称", 120),
    averageScore: boundedScore(value.averageScore, "技能平均分", 20),
    latestScore: boundedScore(value.latestScore, "技能最新分", 20),
    sampleCount: boundedInteger(value.sampleCount, "技能样本数", 1_000_000)
  };
}

function normalizeReportMetrics(value: TrainingReportMetrics): TrainingReportMetrics {
  if (!value || typeof value !== "object") {
    throw new ValidationError("成长报告聚合指标格式不正确。");
  }
  if (typeof value.trend !== "number" || !Number.isFinite(value.trend) || value.trend < -100 || value.trend > 100) {
    throw new ValidationError("成长得分趋势必须是 -100 到 100 之间的数字。");
  }
  return {
    reportCount: boundedInteger(value.reportCount, "成长报告数", 1_000_000),
    averageScore: boundedScore(value.averageScore, "成长平均分", 100),
    latestScore: boundedScore(value.latestScore, "成长最新分", 100),
    trend: value.trend
  };
}

function normalizeDistribution<const T extends readonly string[]>(
  value: unknown,
  keys: T,
  label: string
): Record<T[number], number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new ValidationError(`${label}包含未知分类。`);
  }
  return Object.fromEntries(keys.map((key) => [
    key,
    boundedInteger(record[key] ?? 0, `${label}${key}`, 1_000_000)
  ])) as Record<T[number], number>;
}

function normalizeCrmMetrics(value: TrainingCrmMetrics): TrainingCrmMetrics {
  if (!value || typeof value !== "object") {
    throw new ValidationError("CRM 聚合指标格式不正确。");
  }
  return {
    profileCount: boundedInteger(value.profileCount, "客户画像数", 1_000_000),
    averagePurchaseProbability: boundedScore(value.averagePurchaseProbability, "平均成交概率", 100),
    intentDistribution: normalizeDistribution(
      value.intentDistribution,
      TRAINING_CUSTOMER_INTENTS,
      "客户意向分布"
    ),
    riskDistribution: normalizeDistribution(
      value.riskDistribution,
      TRAINING_CUSTOMER_RISK_LEVELS,
      "客户风险分布"
    )
  };
}

function normalizeCourseReference(value: TrainingCourseReference): TrainingCourseReference {
  return {
    id: boundedText(value.id, "课程 ID", 160),
    title: boundedText(value.title, "课程标题", 160),
    category: category(value.category),
    level: level(value.level),
    description: optionalText(value.description, "课程简介", 1_000)
  };
}

function ensureUniqueCourseIds(courses: TrainingCourseReference[]) {
  if (new Set(courses.map((course) => course.id)).size !== courses.length) {
    throw new ValidationError("推荐课程列表包含重复课程。");
  }
}

export function normalizeTrainingEvaluationInput(input: TrainingEvaluationInput): TrainingEvaluationInput {
  return {
    question: boundedText(input.question, "训练问题", 4_000),
    answer: boundedText(input.answer, "员工回答", 20_000),
    standard: boundedText(input.standard, "评分标准", 12_000),
    provider: input.provider,
    requestId: optionalText(input.requestId, "请求 ID", 160)
  };
}

export function normalizeTrainingRecommendationInput(
  input: TrainingRecommendationInput
): TrainingRecommendationInput {
  if (!Array.isArray(input.skillMetrics) || input.skillMetrics.length > 40) {
    throw new ValidationError("技能聚合指标格式不正确。");
  }
  if (input.courses !== undefined && (!Array.isArray(input.courses) || input.courses.length > 80)) {
    throw new ValidationError("候选课程列表格式不正确。");
  }

  const courses = input.courses?.map(normalizeCourseReference);
  if (courses) ensureUniqueCourseIds(courses);
  return {
    skillMetrics: input.skillMetrics.map(normalizeSkillMetric),
    reportMetrics: normalizeReportMetrics(input.reportMetrics),
    crmMetrics: normalizeCrmMetrics(input.crmMetrics),
    courses,
    provider: input.provider,
    requestId: optionalText(input.requestId, "请求 ID", 160)
  };
}

export function normalizeTrainingSimulationInput(
  input: GenerateTrainingSimulationInput
): GenerateTrainingSimulationInput {
  return {
    course: {
      title: boundedText(input.course.title, "课程标题", 160),
      description: optionalText(input.course.description, "课程简介", 1_000),
      category: category(input.course.category),
      level: level(input.course.level),
      content: boundedText(input.course.content, "课程内容", 30_000)
    },
    knowledgeContext: input.knowledgeContext,
    provider: input.provider,
    requestId: optionalText(input.requestId, "请求 ID", 160)
  };
}

export function normalizeTrainingCourseContentInput(
  input: GenerateTrainingCourseContentInput
): GenerateTrainingCourseContentInput {
  return {
    title: boundedText(input.title, "课程标题", 160),
    category: category(input.category),
    level: level(input.level),
    knowledgeContext: input.knowledgeContext,
    provider: input.provider,
    requestId: optionalText(input.requestId, "请求 ID", 160)
  };
}
