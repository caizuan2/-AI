export { analyzeCustomer } from "@/apps/team-os/services/customer-ai/analyze-customer";
export { generateFollowUpSuggestion } from "@/apps/team-os/services/customer-ai/generate-follow-up-suggestion";
export {
  createDefaultCustomerAiProvider,
  parseCustomerAnalysisResponse,
  parseFollowUpSuggestionResponse
} from "@/apps/team-os/services/customer-ai/customer-ai-provider";
export {
  buildAnalyzeCustomerPrompt,
  buildFollowUpSuggestionPrompt
} from "@/apps/team-os/services/customer-ai/customer-ai-prompts";
export type {
  AnalyzeCustomerInput,
  CustomerAiBaseInput,
  CustomerAiCustomer,
  CustomerAiFollowUp,
  CustomerAiProvider,
  CustomerAnalysisResult,
  CustomerFollowUpType,
  CustomerIntent,
  CustomerLevel,
  CustomerRiskLevel,
  CustomerStage,
  FollowUpSuggestionResult,
  GenerateFollowUpSuggestionInput
} from "@/apps/team-os/services/customer-ai/types";
