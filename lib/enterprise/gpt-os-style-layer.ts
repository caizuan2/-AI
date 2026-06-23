export interface GptOSStyleLayerResult {
  tone: "native";
  structure: "raw_model_output";
  priority: "model_output_first";
  output: string;
  changed: false;
  diagnostics: string[];
}

export const OUTPUT_PRIORITY = [
  "raw_model_output",
  "natural_language_response",
  "reasoning_explanation",
  "structured_metadata"
] as const;

export const STRUCTURED_DATA_POLICY = "structured metadata must never rewrite the primary response";

export function enhanceGPTStyle(output: string): GptOSStyleLayerResult {
  return {
    tone: "native",
    structure: "raw_model_output",
    priority: "model_output_first",
    output,
    changed: false,
    diagnostics: [
      "gptStyle:pass_through_only",
      "gptStyle:no_formatting_changes",
      "gptStyle:no_structure_enhancement"
    ]
  };
}

export function naturalLanguageFirst(output: string) {
  return output;
}

export function conversationalVersion(output: string) {
  return output;
}
