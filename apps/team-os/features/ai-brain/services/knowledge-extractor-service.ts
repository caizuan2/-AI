import "server-only";

import { ValidationError } from "@/lib/errors";
import { assertCanExtractSource, type AiBrainAccessScope } from "@/apps/team-os/features/ai-brain/services/ai-brain-access";
import { upsertKnowledgeCandidate } from "@/apps/team-os/features/ai-brain/services/ai-brain-repository";
import { excellentCaseExtractor } from "@/apps/team-os/features/ai-brain/extractors/excellent-case-extractor";
import type { ExtractKnowledgeInput } from "@/apps/team-os/features/ai-brain/types";

export async function extractKnowledgeCandidate(
  access: AiBrainAccessScope,
  input: ExtractKnowledgeInput
) {
  // Authorize the caller-supplied team before looking up a source record so
  // managers cannot use response differences to enumerate another team.
  assertCanExtractSource(access, input.sourceType, input.teamId);
  const material = await excellentCaseExtractor.extract({
    companyId: access.context.companyId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    requestedTeamId: input.teamId
  });
  assertCanExtractSource(access, input.sourceType, material.teamId);
  if (input.teamId && input.teamId !== material.teamId) {
    throw new ValidationError("业务记录与所选团队不一致。");
  }
  return upsertKnowledgeCandidate(material);
}

export class KnowledgeExtractorService {
  extract = extractKnowledgeCandidate;
}

export const knowledgeExtractorService = new KnowledgeExtractorService();
