import type { KnowledgeCandidateSourceType } from "@/apps/team-os/features/ai-brain/types";

export interface AiBrainPermissionPolicyInput {
  isCompanyOwner: boolean;
  managerTeamIds: string[];
  trainerTeamIds: string[];
}

export function canExtractKnowledgeSource(
  scope: AiBrainPermissionPolicyInput,
  sourceType: KnowledgeCandidateSourceType,
  teamId?: string
) {
  if (scope.isCompanyOwner) return true;
  if (!teamId) return false;
  if (scope.managerTeamIds.includes(teamId)) return true;
  return sourceType === "TRAINING" && scope.trainerTeamIds.includes(teamId);
}

export function canReviewKnowledgeCandidate(scope: AiBrainPermissionPolicyInput) {
  return scope.isCompanyOwner;
}

export function canGenerateKnowledgeOptimization(scope: AiBrainPermissionPolicyInput) {
  return scope.isCompanyOwner;
}
