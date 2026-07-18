import "server-only";

import { getIndustryKnowledgeContext } from "@/apps/team-os/services/knowledge-context";
import {
  evaluateTraining,
  generateTrainingCourseContent,
  generateTrainingSimulation,
  recommendTraining
} from "@/apps/team-os/services/training-ai";
import {
  loadTrainingEvaluationContext,
  loadTrainingRecommendationInput,
  saveTrainingCourseForUser,
  saveTrainingEvaluation
} from "@/apps/team-os/features/training/services/training-repository";
import {
  assertTrainingCourseEditor,
  resolveTrainingAccess
} from "@/apps/team-os/features/training/services/training-access";
import {
  createTrainingScenarioToken,
  verifyTrainingScenarioToken
} from "@/apps/team-os/features/training/services/training-scenario-token";
import type {
  EvaluateTrainingInput,
  TrainingRecommendationData,
  TrainingSimulationData,
  UpsertTrainingCourseInput
} from "@/apps/team-os/features/training/types";
import { ValidationError } from "@/lib/errors";

type TrainingKnowledgePurpose = "COURSE_CONTENT" | "SIMULATION";

function safeKnowledgeQuery(input: {
  category: string;
  level: string;
  purpose: TrainingKnowledgePurpose;
}) {
  const theme = input.purpose === "COURSE_CONTENT"
    ? "课程内容、销售 SOP、产品知识、客户服务规范"
    : input.purpose === "SIMULATION"
      ? "模拟客户、异议处理、标准话术、沟通训练"
      : "培训评分、标准答案、销售 SOP、服务规范";
  return [
    "AI 培训中心",
    `课程分类：${input.category}`,
    `课程等级：${input.level}`,
    `训练主题：${theme}`
  ].join("\n");
}

async function loadTrainingKnowledge(input: {
  userId: string;
  companyId: string;
  teamId: string;
  category: string;
  level: string;
  purpose: TrainingKnowledgePurpose;
  requestId?: string;
}) {
  return getIndustryKnowledgeContext({
    conversation: safeKnowledgeQuery(input),
    companyId: input.companyId,
    teamId: input.teamId,
    actorUserId: input.userId,
    requestId: input.requestId
  });
}

function assertGeneratedCourseHasNoObviousContactData(description: string, content: string) {
  const generated = `${description}\n${content}`;
  const containsContactData = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{15,18}[0-9Xx]?(?!\d)|(?:微信|wechat|手机号|联系电话|电话)\s*[:：]?\s*[A-Z0-9_-]{5,}/i.test(generated);
  if (containsContactData) {
    throw new ValidationError("知识生成内容可能包含个人联系方式，已阻止保存。请清理知识来源后重试。");
  }
}

export async function upsertTrainingCourseWithKnowledge(
  userId: string,
  input: UpsertTrainingCourseInput,
  requestId?: string
) {
  let description = input.description ?? `${input.title}培训课程`;
  let content = input.content ?? "";
  if (input.generateFromKnowledge) {
    const context = await resolveTrainingAccess(userId, input.companyId);
    assertTrainingCourseEditor(context);
    const teamId = context.directTeamIds[0];
    if (!teamId) {
      throw new Error("当前账号没有可用于企业知识授权的团队。");
    }
    const knowledgeContext = await loadTrainingKnowledge({
      userId,
      companyId: context.context.companyId,
      teamId,
      category: input.category,
      level: input.level,
      purpose: "COURSE_CONTENT",
      requestId
    });
    const generated = await generateTrainingCourseContent({
      title: input.title,
      category: input.category,
      level: input.level,
      knowledgeContext,
      requestId
    });
    description = generated.description;
    content = generated.content;
    assertGeneratedCourseHasNoObviousContactData(description, content);
  }
  return saveTrainingCourseForUser(userId, {
    ...input,
    status: input.generateFromKnowledge ? "DISABLED" : input.status,
    description,
    content
  });
}

export async function createTrainingSimulationForUser(
  userId: string,
  courseId: string,
  requestId?: string
): Promise<TrainingSimulationData> {
  const context = await loadTrainingEvaluationContext(userId, courseId);
  const knowledgeContext = await loadTrainingKnowledge({
    userId,
    companyId: context.companyId,
    teamId: context.knowledgeAuthorizationTeamId,
    category: context.course.category,
    level: context.course.level,
    purpose: "SIMULATION",
    requestId
  });
  const simulation = await generateTrainingSimulation({
    course: {
      title: context.course.title,
      description: context.course.description,
      category: context.course.category,
      level: context.course.level,
      content: context.course.content
    },
    knowledgeContext,
    requestId
  });
  return {
    courseId: context.course.id,
    courseTitle: context.course.title,
    question: simulation.question,
    scenarioToken: createTrainingScenarioToken({
      userId,
      companyId: context.companyId,
      courseId: context.course.id,
      courseUpdatedAt: context.expectedCourseUpdatedAt,
      question: simulation.question,
      standard: simulation.standard
    })
  };
}

export async function evaluateTrainingForUser(
  userId: string,
  input: EvaluateTrainingInput,
  requestId?: string
) {
  const context = await loadTrainingEvaluationContext(userId, input.courseId);
  const scenario = verifyTrainingScenarioToken({
    token: input.scenarioToken,
    userId,
    companyId: context.companyId,
    courseId: context.course.id,
    courseUpdatedAt: context.expectedCourseUpdatedAt,
    question: input.question
  });
  const result = await evaluateTraining({
    question: input.question,
    answer: input.answer,
    standard: scenario.standard,
    requestId
  });
  return saveTrainingEvaluation({
    userId,
    context,
    question: input.question,
    answer: input.answer,
    result
  });
}

export async function recommendTrainingForUser(
  userId: string,
  companyId: string | undefined,
  requestId?: string
): Promise<TrainingRecommendationData> {
  const source = await loadTrainingRecommendationInput(userId, companyId);
  if (!source.input.courses || source.input.courses.length === 0) {
    return {
      context: source.access.context,
      summary: "当前企业还没有可推荐的启用课程。",
      recommendations: []
    };
  }
  const hasGrowthSignals = source.input.skillMetrics.length > 0 ||
    source.input.reportMetrics.reportCount > 0 ||
    source.input.crmMetrics.profileCount > 0;
  if (!hasGrowthSignals) {
    return {
      context: source.access.context,
      summary: "暂无足够的员工成长数据，完成任务分析或客户跟进后再生成个性化推荐。",
      recommendations: []
    };
  }
  const hasMeasuredGap = source.input.skillMetrics.some((metric) =>
    metric.averageScore < 16 || metric.latestScore < 16
  ) || (
    source.input.reportMetrics.reportCount > 0 && (
      source.input.reportMetrics.averageScore < 80 ||
      source.input.reportMetrics.latestScore < 80 ||
      source.input.reportMetrics.trend < 0
    )
  ) || (
    source.input.crmMetrics.profileCount > 0 && (
      source.input.crmMetrics.averagePurchaseProbability < 70 ||
      (source.input.crmMetrics.riskDistribution.MEDIUM ?? 0) > 0 ||
      (source.input.crmMetrics.riskDistribution.HIGH ?? 0) > 0 ||
      (source.input.crmMetrics.intentDistribution.HESITANT ?? 0) > 0 ||
      (source.input.crmMetrics.intentDistribution.CHURN_RISK ?? 0) > 0
    )
  );
  if (!hasMeasuredGap) {
    return {
      context: source.access.context,
      summary: "当前聚合指标未显示明显能力缺口，暂不追加培训课程。",
      recommendations: []
    };
  }
  const result = await recommendTraining({ ...source.input, requestId });
  return {
    context: source.access.context,
    summary: result.summary,
    recommendations: result.recommendations.map((recommendation) => ({
      ...(recommendation.courseId ? { courseId: recommendation.courseId } : {}),
      title: recommendation.title,
      reason: recommendation.reason,
      priority: recommendation.priority,
      focusAreas: recommendation.focusAreas
    }))
  };
}
