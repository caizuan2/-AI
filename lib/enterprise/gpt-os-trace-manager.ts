export type GptOSTraceStepName =
  | "input"
  | "planner"
  | "memory"
  | "agent"
  | "reasoning"
  | "tool"
  | "business"
  | "growth"
  | "kernel"
  | "response";

export type GptOSTraceStepStatus = "success" | "warning" | "error" | "skipped";

export interface GptOSTraceStep {
  name: GptOSTraceStepName;
  label: string;
  latencyMs: number;
  status: GptOSTraceStepStatus;
  detail: string;
  startedAt: number;
  endedAt: number;
}

export interface GptOSTrace {
  traceId: string;
  requestId: string;
  timestamp: number;
  provider: string;
  model: string;
  agentUsed: string;
  fallbackUsed: boolean;
  steps: GptOSTraceStep[];
  toolChain: string[];
}

interface GptOSTraceInput {
  text: string;
  provider?: string;
  model?: string;
  agentId: string;
  agentLabel: string;
  plannerIntent: string;
  plannerComplexity: string;
  memoryLabel: string;
  reasoningLoop?: {
    iterations?: number;
    loopStatus?: string;
    toolFeedback?: string[];
  };
  businessType?: string;
  growthPotential?: string;
  kernelState?: string;
  fallbackUsed?: boolean;
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function makeId(prefix: string, seed: number) {
  return `${prefix}_${Date.now().toString(36)}_${seed.toString(36).slice(0, 8)}`;
}

function latency(seed: number, index: number, base: number, spread: number) {
  return base + ((seed + index * 31) % spread);
}

export function createGptOSTrace(input: GptOSTraceInput): GptOSTrace {
  const seed = stableHash([
    input.text,
    input.agentId,
    input.plannerIntent,
    input.plannerComplexity
  ].join("|"));
  const timestamp = Date.now();
  let cursor = timestamp;
  const toolChain = (input.reasoningLoop?.toolFeedback ?? [])
    .map((feedback) => feedback.split(":")[0]?.trim())
    .filter((item): item is string => Boolean(item));

  function step(
    name: GptOSTraceStepName,
    label: string,
    index: number,
    base: number,
    spread: number,
    detail: string,
    status: GptOSTraceStepStatus = "success"
  ): GptOSTraceStep {
    const latencyMs = latency(seed, index, base, spread);
    const startedAt = cursor;
    const endedAt = startedAt + latencyMs;
    cursor = endedAt;

    return {
      name,
      label,
      latencyMs,
      status,
      detail,
      startedAt,
      endedAt
    };
  }

  const steps: GptOSTraceStep[] = [
    step("input", "Input Normalize", 1, 8, 18, `input length ${input.text.length}`),
    step("planner", "Planner", 2, 14, 28, `${input.plannerIntent}/${input.plannerComplexity}`),
    step("memory", "Persona Memory", 3, 8, 22, input.memoryLabel),
    step("agent", "Agent Router", 4, 6, 18, `${input.agentLabel} selected`),
    step(
      "reasoning",
      "Reasoning Loop",
      5,
      32 + Math.max(0, (input.reasoningLoop?.iterations ?? 1) - 1) * 18,
      44,
      `${input.reasoningLoop?.loopStatus ?? "unknown"} · ${input.reasoningLoop?.iterations ?? 1} iterations`
    ),
    step(
      "tool",
      "Tool Chain",
      6,
      toolChain.length ? 16 + toolChain.length * 9 : 4,
      toolChain.length ? 26 : 8,
      toolChain.length ? toolChain.join(" → ") : "no tool feedback",
      toolChain.length ? "success" : "skipped"
    ),
    step("business", "Business Intelligence", 7, 10, 18, input.businessType ?? "not enabled"),
    step("growth", "Growth Intelligence", 8, 10, 18, input.growthPotential ?? "not enabled"),
    step("kernel", "OS Kernel", 9, 8, 16, input.kernelState ?? "not enabled"),
    step("response", "Response Compose", 10, 12, 24, "diagnostics attached")
  ];

  return {
    traceId: makeId("trace", seed),
    requestId: makeId("req", seed + steps.length),
    timestamp,
    provider: input.provider ?? "gpt-os",
    model: input.model ?? "gpt-os-router",
    agentUsed: input.agentId,
    fallbackUsed: input.fallbackUsed === true,
    steps,
    toolChain: Array.from(new Set(toolChain))
  };
}
