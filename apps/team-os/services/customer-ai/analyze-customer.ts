import "server-only";

import { createDefaultCustomerAiProvider } from "@/apps/team-os/services/customer-ai/customer-ai-provider";
import type {
  AnalyzeCustomerInput,
  CustomerAiProvider,
  CustomerAnalysisResult
} from "@/apps/team-os/services/customer-ai/types";

export async function analyzeCustomer(
  input: AnalyzeCustomerInput,
  dependencies: { provider?: CustomerAiProvider } = {}
): Promise<CustomerAnalysisResult> {
  const provider = dependencies.provider ?? createDefaultCustomerAiProvider();
  return provider.analyzeCustomer(input);
}
