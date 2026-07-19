import "server-only";

import { normalizeTrainingEvaluationInput } from "@/apps/team-os/services/training-ai/training-ai-input";
import { createDefaultTrainingAiProvider } from "@/apps/team-os/services/training-ai/training-ai-provider";
import type {
  TrainingAiDependencies,
  TrainingEvaluationInput,
  TrainingEvaluationResult
} from "@/apps/team-os/services/training-ai/types";

export async function evaluateTraining(
  input: TrainingEvaluationInput,
  dependencies: TrainingAiDependencies = {}
): Promise<TrainingEvaluationResult> {
  const provider = dependencies.provider ?? createDefaultTrainingAiProvider();
  return provider.evaluate(normalizeTrainingEvaluationInput(input));
}
