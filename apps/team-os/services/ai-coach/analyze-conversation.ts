import "server-only";

import type {
  AnalyzeConversationInput,
  CoachAnalysisResult
} from "@/apps/team-os/features/ai-coach/types";
import {
  createDefaultAiCoachProvider,
  type AiCoachProvider
} from "@/apps/team-os/services/ai-coach/ai-coach-provider";
import {
  KnowledgeContextService,
  type KnowledgeContextMode
} from "@/apps/team-os/services/ai-coach/knowledge-context-service";

export interface AnalyzeConversationServiceInput extends AnalyzeConversationInput {
  actorUserId: string;
  actorTenantId: string | null;
  teamCompanyId: string;
  requestId?: string;
}

export interface AnalyzeConversationServiceResult {
  analysis: CoachAnalysisResult;
  knowledgeContextMode: KnowledgeContextMode;
}

function getScreenshotOrigins(urls: string[]) {
  return Array.from(new Set(urls.map((url) => new URL(url).origin))).slice(0, 6);
}

export async function analyzeConversation(
  input: AnalyzeConversationServiceInput,
  dependencies: {
    provider?: AiCoachProvider;
    knowledgeContextService?: KnowledgeContextService;
  } = {}
): Promise<AnalyzeConversationServiceResult> {
  const knowledgeContextService = dependencies.knowledgeContextService ?? new KnowledgeContextService();
  const provider = dependencies.provider ?? createDefaultAiCoachProvider();
  const knowledgeContext = await knowledgeContextService.getAccessibleContext({
    conversation: input.conversation,
    actorUserId: input.actorUserId,
    actorTenantId: input.actorTenantId,
    teamCompanyId: input.teamCompanyId
  });
  const analysis = await provider.analyze({
    conversation: input.conversation,
    knowledgeContext: knowledgeContext.promptContext,
    screenshotCount: input.screenshotUrls.length,
    screenshotOrigins: getScreenshotOrigins(input.screenshotUrls),
    provider: input.provider,
    requestId: input.requestId
  });

  return {
    analysis,
    knowledgeContextMode: knowledgeContext.mode
  };
}
