import "server-only";

import type { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  KnowledgeCandidateSourceType,
  KnowledgeExtractionMaterial
} from "@/apps/team-os/features/ai-brain/types";
import { redactBusinessContent } from "@/apps/team-os/features/ai-brain/utils/content-safety";
import {
  assertExcellentScore,
  assertRecentSource,
  assertWorkflowQuality
} from "@/apps/team-os/features/ai-brain/validators/source-quality";

const CATEGORY_LABELS: Record<string, string> = {
  PRODUCT: "产品培训",
  SALES: "销售培训",
  CUSTOMER_SERVICE: "客户服务培训",
  MANAGEMENT: "管理培训",
  OTHER: "通用培训"
};

function bounded(value: string, maxLength: number) {
  return redactBusinessContent(value, maxLength);
}

function joinSections(sections: Array<[string, string | undefined | null]>) {
  return bounded(
    sections
      .filter((section): section is [string, string] => Boolean(section[1]?.trim()))
      .map(([label, value]) => `${label}：\n${value.trim()}`)
      .join("\n\n"),
    8_000
  );
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function workflowDecisionTriggered(value: Prisma.JsonValue | null) {
  return isRecord(value) && value.trigger === true;
}

function workflowResultSummary(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) return "";
  const decision = isRecord(value.decision) && typeof value.decision.reason === "string"
    ? `决策依据：${value.decision.reason}`
    : "";
  const actions = Array.isArray(value.actions)
    ? value.actions.flatMap((action) => {
        if (!isRecord(action)) return [];
        const type = typeof action.actionType === "string" ? action.actionType : "业务动作";
        const status = typeof action.status === "string" ? action.status : "UNKNOWN";
        const summary = typeof action.summary === "string" ? action.summary : "";
        return [`${type} / ${status}${summary ? `：${summary}` : ""}`];
      })
    : [];
  return [decision, ...actions].filter(Boolean).join("\n");
}

async function assertActiveSubmitter(userId: string, teamId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { status: true }
  });
  if (membership?.status !== "ACTIVE") {
    throw new ValidationError("任务提交人已不属于该有效团队，不能继续提取。");
  }
}

async function extractTaskSubmission(companyId: string, sourceId: string, requestedTeamId?: string) {
  const submission = await prisma.taskSubmission.findFirst({
    where: {
      id: sourceId,
      status: "ANALYZED",
      task: {
        team: {
          companyId,
          status: "ACTIVE",
          ...(requestedTeamId ? { id: requestedTeamId } : {})
        }
      }
    },
    select: {
      id: true,
      userId: true,
      content: true,
      summary: true,
      createdAt: true,
      task: {
        select: {
          title: true,
          description: true,
          teamId: true
        }
      },
      analysisReport: {
        select: {
          score: true,
          industryScore: true,
          summary: true,
          suggestions: true,
          teamId: true,
          userId: true,
          skillScores: { select: { score: true } }
        }
      }
    }
  });
  if (!submission?.analysisReport) {
    throw new NotFoundError("未找到已完成 AI 分析的任务提交记录。");
  }
  assertRecentSource(submission.createdAt);
  assertExcellentScore({
    score: submission.analysisReport.score,
    industryScore: submission.analysisReport.industryScore,
    skillScores: submission.analysisReport.skillScores.map((item) => item.score)
  });
  if (
    submission.analysisReport.teamId !== submission.task.teamId ||
    submission.analysisReport.userId !== submission.userId
  ) {
    throw new ValidationError("任务分析记录与提交人或团队不一致，已停止提取。");
  }
  await assertActiveSubmitter(submission.userId, submission.task.teamId);
  return {
    companyId,
    teamId: submission.task.teamId,
    sourceType: "CHAT" as const,
    sourceId: submission.id,
    title: bounded(`优秀任务实践：${submission.task.title}`, 160),
    category: "员工优秀沟通案例",
    content: joinSections([
      ["任务目标", submission.task.description],
      ["优秀执行记录", submission.content],
      ["员工总结", submission.summary],
      ["AI 分析摘要", submission.analysisReport.summary],
      ["可复用建议", submission.analysisReport.suggestions.join("；")]
    ]),
    qualityScore: submission.analysisReport.score,
    reason: "已分析任务提交达到优秀案例阈值"
  } satisfies KnowledgeExtractionMaterial;
}

async function extractCoachReport(companyId: string, sourceId: string, requestedTeamId?: string) {
  const report = await prisma.employeeAnalysisReport.findFirst({
    where: {
      id: sourceId,
      ...(requestedTeamId ? { teamId: requestedTeamId } : {}),
      team: { companyId, status: "ACTIVE" }
    },
    select: {
      id: true,
      teamId: true,
      score: true,
      industryScore: true,
      summary: true,
      suggestions: true,
      trainingPlan: true,
      coachFeedback: true,
      improvementPlan: true,
      createdAt: true,
      skillScores: { select: { skillName: true, score: true } }
    }
  });
  if (!report) throw new NotFoundError("未找到该企业的 AI 教练分析记录。");
  assertRecentSource(report.createdAt);
  assertExcellentScore({
    score: report.score,
    industryScore: report.industryScore,
    skillScores: report.skillScores.map((item) => item.score)
  });
  return {
    companyId,
    teamId: report.teamId,
    sourceType: "AI_COACH" as const,
    sourceId: report.id,
    title: bounded(`AI 教练优秀实践（${report.score} 分）`, 160),
    category: "AI 教练优秀案例",
    content: joinSections([
      ["优秀实践摘要", report.summary],
      ["能力得分", report.skillScores.map((item) => `${item.skillName} ${item.score} 分`).join("；")],
      ["可复用建议", report.suggestions.join("；")],
      ["教练反馈", report.coachFeedback],
      ["训练计划", report.trainingPlan],
      ["后续提升", report.improvementPlan]
    ]),
    qualityScore: report.score,
    reason: "AI 教练报告达到优秀案例阈值"
  } satisfies KnowledgeExtractionMaterial;
}

async function extractCrmCase(companyId: string, sourceId: string, requestedTeamId?: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: sourceId,
      companyId,
      ...(requestedTeamId ? { teamId: requestedTeamId } : {}),
      stage: "CUSTOMER",
      team: { status: "ACTIVE" }
    },
    select: {
      id: true,
      teamId: true,
      level: true,
      updatedAt: true,
      followUps: {
        where: { content: { not: "" } },
        select: { type: true, content: true, summary: true, nextPlan: true, aiSuggestion: true },
        orderBy: { createdAt: "desc" },
        take: 12
      },
      aiProfile: { select: { painPoints: true, nextAction: true } }
    }
  });
  if (!customer || customer.followUps.length === 0) {
    throw new NotFoundError("未找到可沉淀的成交客户跟进记录。");
  }
  assertRecentSource(customer.updatedAt);
  const timeline = [...customer.followUps].reverse().map((item, index) => [
    `${index + 1}. ${item.type}`,
    item.content,
    item.summary ? `总结：${item.summary}` : "",
    item.aiSuggestion ? `建议：${item.aiSuggestion}` : "",
    item.nextPlan ? `后续计划：${item.nextPlan}` : ""
  ].filter(Boolean).join("\n")).join("\n\n");
  return {
    companyId,
    teamId: customer.teamId,
    sourceType: "CRM" as const,
    sourceId: customer.id,
    title: "成交客户跟进案例",
    category: "CRM 成交跟进案例",
    content: joinSections([
      ["案例说明", "以下内容是成交客户的历史跟进经验，不代表单一话术直接导致成交。"],
      ["客户层级", customer.level],
      ["典型痛点", customer.aiProfile?.painPoints.join("；")],
      ["跟进过程", timeline],
      ["建议下一步", customer.aiProfile?.nextAction]
    ]),
    qualityScore: Math.min(100, 80 + customer.followUps.length * 2),
    reason: "成交客户具备可复用的完整跟进记录"
  } satisfies KnowledgeExtractionMaterial;
}

async function extractTrainingCase(companyId: string, sourceId: string, requestedTeamId?: string) {
  const evaluationReference = await prisma.aITrainingEvaluation.findFirst({
    where: { id: sourceId, course: { companyId, status: "ACTIVE" } },
    select: {
      id: true,
      userId: true,
      courseId: true
    }
  });
  if (!evaluationReference) {
    throw new NotFoundError(
      requestedTeamId ? "未找到该团队可提取的培训测评记录。" : "未找到该企业的培训测评记录。"
    );
  }
  const assignments = await prisma.trainingAssignment.findMany({
    where: {
      companyId,
      courseId: evaluationReference.courseId,
      userId: evaluationReference.userId,
      status: { not: "CANCELLED" },
      team: { status: "ACTIVE" },
      ...(requestedTeamId ? { teamId: requestedTeamId } : {})
    },
    select: { teamId: true },
    distinct: ["teamId"],
    take: 2
  });
  if (assignments.length !== 1) {
    if (requestedTeamId) {
      throw new NotFoundError("未找到该团队可提取的培训测评记录。");
    }
    throw new ValidationError(
      assignments.length === 0
        ? "培训记录无法关联到有效团队。"
        : "培训记录关联多个团队，请明确选择所属团队后重试。"
    );
  }
  const evaluation = await prisma.aITrainingEvaluation.findUnique({
    where: { id: evaluationReference.id },
    select: {
      id: true,
      question: true,
      answer: true,
      score: true,
      feedback: true,
      createdAt: true,
      course: { select: { title: true, category: true, description: true } }
    }
  });
  if (!evaluation) throw new NotFoundError("培训测评记录已不存在。");
  assertRecentSource(evaluation.createdAt);
  assertExcellentScore({ score: evaluation.score });
  return {
    companyId,
    teamId: assignments[0]!.teamId,
    sourceType: "TRAINING" as const,
    sourceId: evaluation.id,
    title: bounded(`培训优秀答卷：${evaluation.course.title}`, 160),
    category: CATEGORY_LABELS[evaluation.course.category] ?? "培训优秀案例",
    content: joinSections([
      ["课程目标", evaluation.course.description],
      ["训练问题", evaluation.question],
      ["优秀回答", evaluation.answer],
      ["测评反馈", evaluation.feedback]
    ]),
    qualityScore: evaluation.score,
    reason: "培训测评达到优秀答卷阈值"
  } satisfies KnowledgeExtractionMaterial;
}

async function extractWorkflowCase(companyId: string, sourceId: string, requestedTeamId?: string) {
  const execution = await prisma.workflowExecution.findFirst({
    where: {
      id: sourceId,
      companyId,
      ...(requestedTeamId ? { teamId: requestedTeamId } : {}),
      mode: "PRODUCTION",
      status: "SUCCESS",
      workflow: { status: "ACTIVE" }
    },
    select: {
      id: true,
      workflowId: true,
      teamId: true,
      eventType: true,
      decision: true,
      result: true,
      createdAt: true,
      workflow: { select: { name: true, description: true } }
    }
  });
  if (!execution) throw new NotFoundError("未找到成功的生产工作流执行记录。");
  assertRecentSource(execution.createdAt);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const executionScope = { teamId: execution.teamId };
  const [productionRuns, successfulRuns] = await Promise.all([
    prisma.workflowExecution.count({
      where: {
        companyId,
        workflowId: execution.workflowId,
        mode: "PRODUCTION",
        createdAt: { gte: since },
        ...executionScope
      }
    }),
    prisma.workflowExecution.count({
      where: {
        companyId,
        workflowId: execution.workflowId,
        mode: "PRODUCTION",
        status: "SUCCESS",
        createdAt: { gte: since },
        ...executionScope
      }
    })
  ]);
  assertWorkflowQuality({
    decisionTriggered: workflowDecisionTriggered(execution.decision),
    productionRuns,
    successfulRuns
  });
  const summary = workflowResultSummary(execution.result);
  if (!summary) throw new ValidationError("工作流执行结果缺少可复用的决策与动作摘要。");
  return {
    companyId,
    ...(execution.teamId ? { teamId: execution.teamId } : {}),
    sourceType: "WORKFLOW" as const,
    sourceId: execution.id,
    title: bounded(`工作流最佳实践：${execution.workflow.name}`, 160),
    category: "企业工作流最佳实践",
    content: joinSections([
      ["流程说明", execution.workflow.description],
      ["触发事件", execution.eventType],
      ["验证样本", `近 30 天生产执行 ${productionRuns} 次，成功 ${successfulRuns} 次。`],
      ["成功决策与动作", summary]
    ]),
    qualityScore: Math.round(successfulRuns / productionRuns * 100),
    reason: "稳定生产工作流达到样本量与成功率阈值"
  } satisfies KnowledgeExtractionMaterial;
}

export async function extractExcellentCase(input: {
  companyId: string;
  sourceType: KnowledgeCandidateSourceType;
  sourceId: string;
  requestedTeamId?: string;
}) {
  switch (input.sourceType) {
    case "CHAT":
      return extractTaskSubmission(input.companyId, input.sourceId, input.requestedTeamId);
    case "CRM":
      return extractCrmCase(input.companyId, input.sourceId, input.requestedTeamId);
    case "AI_COACH":
      return extractCoachReport(input.companyId, input.sourceId, input.requestedTeamId);
    case "TRAINING":
      return extractTrainingCase(input.companyId, input.sourceId, input.requestedTeamId);
    case "WORKFLOW":
      return extractWorkflowCase(input.companyId, input.sourceId, input.requestedTeamId);
  }
}

export class ExcellentCaseExtractor {
  extract = extractExcellentCase;
}

export const excellentCaseExtractor = new ExcellentCaseExtractor();
