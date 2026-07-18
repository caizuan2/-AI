import "server-only";

import {
  getIndustryKnowledgeContext,
  type IndustryKnowledgeContextMode,
  type IndustryKnowledgeContextResult
} from "@/apps/team-os/services/knowledge-context";

export type KnowledgeContextMode = IndustryKnowledgeContextMode;
export type KnowledgeContextResult = IndustryKnowledgeContextResult;

export class KnowledgeContextService {
  async getAccessibleContext(input: {
    conversation: string;
    actorUserId: string;
    teamCompanyId: string;
    teamId: string;
    requestId?: string;
  }): Promise<KnowledgeContextResult> {
    return getIndustryKnowledgeContext({
      conversation: input.conversation,
      companyId: input.teamCompanyId,
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      requestId: input.requestId
    });
  }
}
