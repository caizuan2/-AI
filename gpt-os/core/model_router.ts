export type GptOsIntent = "qa" | "task" | "action" | "multi-step" | "diagnostic";

export type GptOsProviderStatus = "ok" | "disabled" | "error";

export interface ModelRouteInput {
  intent?: GptOsIntent;
  reasoningRequested?: boolean;
  reasoningAvailable?: boolean;
  requestId?: string;
}

export interface ModelRouteDecision {
  model: string;
  actualModel: string;
  route_decision:
    | "default_model_selected"
    | "reasoning_model_selected"
    | "reasoning_requested_but_disabled";
  fallbackUsed: false;
  provider_status: GptOsProviderStatus;
  requestId?: string;
}

export const GPT_OS_DEFAULT_MODEL = "gpt-4o";
export const GPT_OS_REASONING_MODEL = "gpt-5.5";

export function routeModel(input: ModelRouteInput = {}): ModelRouteDecision {
  // Stage 3 skeleton only prepares future routing and never changes the live ask.ts path.
  const reasoningRequested = input.reasoningRequested === true;
  const reasoningAvailable = input.reasoningAvailable === true;

  if (reasoningRequested && reasoningAvailable) {
    return {
      model: GPT_OS_REASONING_MODEL,
      actualModel: GPT_OS_REASONING_MODEL,
      route_decision: "reasoning_model_selected",
      fallbackUsed: false,
      provider_status: "ok",
      requestId: input.requestId,
    };
  }

  return {
    model: GPT_OS_DEFAULT_MODEL,
    actualModel: GPT_OS_DEFAULT_MODEL,
    route_decision: reasoningRequested
      ? "reasoning_requested_but_disabled"
      : "default_model_selected",
    fallbackUsed: false,
    provider_status: reasoningRequested ? "disabled" : "ok",
    requestId: input.requestId,
  };
}
