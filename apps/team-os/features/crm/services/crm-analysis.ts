import "server-only";

import {
  createDefaultCustomerAiProvider,
  analyzeCustomer,
  generateFollowUpSuggestion
} from "@/apps/team-os/services/customer-ai";
import { getIndustryKnowledgeContext } from "@/apps/team-os/services/knowledge-context";
import {
  loadCustomerAnalysisContext,
  saveCustomerAnalysis
} from "@/apps/team-os/features/crm/services/crm-repository";
import type {
  AnalyzeCustomerInput,
  AnalyzeCustomerResult
} from "@/apps/team-os/features/crm/types";

function buildKnowledgeQuery(
  context: Awaited<ReturnType<typeof loadCustomerAnalysisContext>>
) {
  return [
    "AI CRM 客户跟进辅助",
    "客户阶段：" + context.customer.stage,
    "客户等级：" + context.customer.level,
    "匹配主题：产品知识、销售话术、常见异议处理方案"
  ].join("\n");
}

export async function analyzeCustomerForUser(
  userId: string,
  input: AnalyzeCustomerInput,
  requestId?: string
): Promise<AnalyzeCustomerResult> {
  const context = await loadCustomerAnalysisContext(userId, input.customerId);
  const conversation = input.conversation?.trim() ?? "";
  const knowledgeContext = await getIndustryKnowledgeContext({
    // Knowledge retrieval can be logged by the existing service. Keep customer
    // names, notes, follow-ups and ad-hoc conversation out of its query.
    conversation: buildKnowledgeQuery(context),
    companyId: context.companyId,
    teamId: context.knowledgeAuthorizationTeamId,
    actorUserId: userId,
    requestId
  });
  const provider = createDefaultCustomerAiProvider();
  const profile = await analyzeCustomer({
    customer: context.customer,
    followUps: context.followUps,
    conversation,
    knowledgeContext,
    requestId
  }, { provider });
  const suggestion = await generateFollowUpSuggestion({
    customer: context.customer,
    followUps: context.followUps,
    conversation,
    knowledgeContext,
    profile,
    requestId
  }, { provider });
  const savedProfile = await saveCustomerAnalysis({
    userId,
    context,
    profile,
    suggestion
  });

  return {
    profile: savedProfile,
    suggestion,
    knowledgeContextMode: knowledgeContext.mode
  };
}
