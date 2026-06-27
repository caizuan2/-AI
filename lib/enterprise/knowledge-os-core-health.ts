import "server-only";

import { calculateReleaseHealth } from "@/lib/enterprise/knowledge-release-health-engine";
import type { KnowledgeReleaseSummary, KnowledgeReleaseSystemAggregation } from "@/lib/enterprise/knowledge-release-types";

export function calculateKnowledgeOSCoreHealth(input: KnowledgeReleaseSystemAggregation): KnowledgeReleaseSummary {
  return calculateReleaseHealth(input);
}
