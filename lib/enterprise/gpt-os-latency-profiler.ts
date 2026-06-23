export interface GptOSLatencyStage {
  name: string;
  latencyMs: number;
  percent: number;
}

export interface GptOSLatencyBreakdown {
  totalLatencyMs: number;
  stages: GptOSLatencyStage[];
  slowestStage: GptOSLatencyStage | null;
}

interface GptOSLatencyInput {
  steps: Array<{
    name: string;
    latencyMs: number;
  }>;
  apiLatencyMs?: number;
}

export function profileGptOSLatency(input: GptOSLatencyInput): GptOSLatencyBreakdown {
  const apiStage = input.apiLatencyMs && input.apiLatencyMs > 0
    ? [{ name: "provider_api", latencyMs: Math.round(input.apiLatencyMs) }]
    : [];
  const rawStages = [
    ...input.steps.map((step) => ({
      name: step.name,
      latencyMs: Math.max(0, Math.round(step.latencyMs))
    })),
    ...apiStage
  ];
  const totalLatencyMs = rawStages.reduce((total, stage) => total + stage.latencyMs, 0);
  const stages = rawStages.map((stage) => ({
    ...stage,
    percent: totalLatencyMs > 0 ? Math.round((stage.latencyMs / totalLatencyMs) * 100) : 0
  }));
  const slowestStage = stages.reduce<GptOSLatencyStage | null>((current, stage) => {
    if (!current || stage.latencyMs > current.latencyMs) {
      return stage;
    }

    return current;
  }, null);

  return {
    totalLatencyMs,
    stages,
    slowestStage
  };
}
