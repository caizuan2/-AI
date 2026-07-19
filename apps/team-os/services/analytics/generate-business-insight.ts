import "server-only";

import { createDefaultAnalyticsAiProvider } from "@/apps/team-os/services/analytics/analytics-ai-provider";
import type {
  AnalyticsAiDependencies,
  BusinessInsightAggregateInput
} from "@/apps/team-os/services/analytics/types";

export async function generateBusinessInsight(
  input: BusinessInsightAggregateInput,
  dependencies: AnalyticsAiDependencies = {}
) {
  const provider = dependencies.provider ?? createDefaultAnalyticsAiProvider();
  return provider.generateInsight(input);
}
