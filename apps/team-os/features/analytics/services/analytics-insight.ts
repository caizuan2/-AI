import "server-only";

import { ValidationError } from "@/lib/errors";
import {
  assertBusinessInsightAccess,
  resolveAnalyticsAccess
} from "@/apps/team-os/features/analytics/services/analytics-access";
import type {
  AnalyticsQuery,
  BusinessInsightData
} from "@/apps/team-os/features/analytics/types";
import {
  generateDashboard,
  getAIAnalytics,
  getCRMAnalytics,
  getTeamMetrics,
  getTrainingAnalytics
} from "@/apps/team-os/services/analytics/analytics-service";
import { generateBusinessInsight } from "@/apps/team-os/services/analytics/generate-business-insight";

export async function generateBusinessInsightForUser(
  userId: string,
  query: AnalyticsQuery,
  requestId?: string
): Promise<BusinessInsightData> {
  const access = await resolveAnalyticsAccess(userId, query.companyId);
  assertBusinessInsightAccess(access);
  const [dashboard, team, crm, training, ai] = await Promise.all([
    generateDashboard(userId, query),
    getTeamMetrics(userId, query),
    getCRMAnalytics(userId, query),
    getTrainingAnalytics(userId, query),
    getAIAnalytics(userId, query)
  ]);
  const uniqueEmployeeIds = new Set(team.rankings.map((item) => item.userId));
  const hasReliableData = dashboard.metrics.taskCompletionRate.available ||
    dashboard.metrics.employeeAverageScore.available ||
    crm.customerCount > 0 || training.assignmentCount > 0 || ai.trackedOutputCount > 0;
  if (!hasReliableData) {
    throw new ValidationError("当前分析范围暂无足够聚合数据，暂时无法生成经营建议。");
  }
  const dataCoverage = Array.from(new Set([
    ...dashboard.dataCoverage,
    ...team.dataCoverage,
    ...crm.dataCoverage,
    ...training.dataCoverage,
    ...ai.dataCoverage,
    ...ai.unavailableMetrics
  ])).slice(0, 30);
  const result = await generateBusinessInsight({
    dashboard: {
      taskCompletionRate: dashboard.metrics.taskCompletionRate.value,
      employeeAverageScore: dashboard.metrics.employeeAverageScore.value,
      customerConversionRate: dashboard.metrics.customerConversionRate.value,
      trainingCompletionRate: dashboard.metrics.trainingCompletionRate.value,
      trackedAiOutputCount: ai.trackedOutputCount
    },
    team: {
      uniqueEmployeeCount: uniqueEmployeeIds.size,
      averageGrowthScore: dashboard.metrics.employeeAverageScore.value,
      attentionCount: new Set(
        team.rankings
          .filter((item) => item.growthLevel === "需关注")
          .map((item) => item.userId)
      ).size
    },
    crm: {
      customerCount: crm.customerCount,
      conversionRate: crm.conversionRate,
      highValueCustomerCount: crm.highValueCustomerCount,
      riskCustomerCount: crm.riskCustomerCount
    },
    training: {
      assignmentCount: training.assignmentCount,
      completionRate: training.completionRate,
      averageScore: training.averageScore
    },
    ai: {
      trackedOutputCount: ai.trackedOutputCount,
      coachReportCount: ai.coachReportCount,
      crmProfileCount: ai.crmProfileCount,
      trainingEvaluationCount: ai.trainingEvaluationCount
    },
    dataCoverage,
    requestId
  });
  return {
    context: dashboard.context,
    range: dashboard.range,
    ...result,
    generatedAt: new Date().toISOString()
  };
}
