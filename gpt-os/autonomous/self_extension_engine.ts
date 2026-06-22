export interface ToolDefinitionProposal {
  name: string;
  status: "proposal_only";
  purpose: string;
}

export interface SelfExtensionProposal {
  new_tool_definitions: ToolDefinitionProposal[];
  rag_strategy_proposals: string[];
  prompt_template_proposals: string[];
  agent_workflow_proposals: string[];
  execution_status: "suggestion_only";
}

export interface SelfExtensionInput {
  missingTopics?: string[];
  riskAreas?: string[];
  answerQuality?: "high" | "medium" | "low";
}

export function proposeSelfExtensions(input: SelfExtensionInput): SelfExtensionProposal {
  const missingTopics = input.missingTopics ?? [];
  const riskAreas = input.riskAreas ?? [];

  return {
    new_tool_definitions: buildToolProposals(missingTopics, riskAreas),
    rag_strategy_proposals: buildRagStrategyProposals(missingTopics, riskAreas),
    prompt_template_proposals: buildPromptTemplateProposals(input.answerQuality),
    agent_workflow_proposals: buildAgentWorkflowProposals(riskAreas),
    execution_status: "suggestion_only",
  };
}

function buildToolProposals(missingTopics: string[], riskAreas: string[]): ToolDefinitionProposal[] {
  const proposals: ToolDefinitionProposal[] = [];

  if (missingTopics.length > 0) {
    proposals.push({
      name: "knowledge_gap_review",
      status: "proposal_only",
      purpose: "List missing knowledge topics for human ingest review.",
    });
  }

  if (riskAreas.includes("model_fallback")) {
    proposals.push({
      name: "provider_health_probe",
      status: "proposal_only",
      purpose: "Summarize model provider health without changing provider routing.",
    });
  }

  return proposals;
}

function buildRagStrategyProposals(missingTopics: string[], riskAreas: string[]): string[] {
  const proposals: string[] = [];

  if (missingTopics.length > 0) {
    proposals.push("Prepare ingest suggestions for repeated missing topics before changing retrieval logic.");
  }

  if (riskAreas.includes("low_rag_quality")) {
    proposals.push("Review chunk titles, summaries, and keyword coverage for low-quality retrieval cases.");
  }

  return proposals;
}

function buildPromptTemplateProposals(answerQuality?: "high" | "medium" | "low"): string[] {
  if (answerQuality === "low") {
    return ["Draft a stricter knowledge-grounded Markdown answer template for human review."];
  }

  return [];
}

function buildAgentWorkflowProposals(riskAreas: string[]): string[] {
  if (riskAreas.length === 0) {
    return [];
  }

  return ["Propose a human-approved workflow that routes repeated failures to ingest review."];
}
