import "server-only";

import { normalizeTrainingSimulationInput } from "@/apps/team-os/services/training-ai/training-ai-input";
import { createDefaultTrainingAiProvider } from "@/apps/team-os/services/training-ai/training-ai-provider";
import type {
  GenerateTrainingSimulationInput,
  TrainingAiDependencies,
  TrainingSimulationResult
} from "@/apps/team-os/services/training-ai/types";

export async function generateTrainingSimulation(
  input: GenerateTrainingSimulationInput,
  dependencies: TrainingAiDependencies = {}
): Promise<TrainingSimulationResult> {
  const provider = dependencies.provider ?? createDefaultTrainingAiProvider();
  return provider.generateSimulation(normalizeTrainingSimulationInput(input));
}
