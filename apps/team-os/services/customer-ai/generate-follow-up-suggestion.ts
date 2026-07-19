import "server-only";

import { createDefaultCustomerAiProvider } from "@/apps/team-os/services/customer-ai/customer-ai-provider";
import type {
  CustomerAiProvider,
  FollowUpSuggestionResult,
  GenerateFollowUpSuggestionInput
} from "@/apps/team-os/services/customer-ai/types";

export async function generateFollowUpSuggestion(
  input: GenerateFollowUpSuggestionInput,
  dependencies: { provider?: CustomerAiProvider } = {}
): Promise<FollowUpSuggestionResult> {
  const provider = dependencies.provider ?? createDefaultCustomerAiProvider();
  return provider.generateFollowUpSuggestion(input);
}
