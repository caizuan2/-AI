export interface LegacyPromptAdapterInput {
  systemInstruction: string;
  userPrompt?: string;
  contextBlocks?: string[];
}

export interface GptOsPromptEnvelope {
  system: string;
  user: string;
  context: string[];
  format: "gpt_os_prompt_v1";
}

export function adaptLegacyRagPrompt(
  input: LegacyPromptAdapterInput,
): GptOsPromptEnvelope {
  // Adapter only wraps existing prompt text for future GPT OS use; it never mutates rag-prompt.ts.
  return {
    system: input.systemInstruction,
    user: input.userPrompt ?? "",
    context: [...(input.contextBlocks ?? [])],
    format: "gpt_os_prompt_v1",
  };
}
