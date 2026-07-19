import "server-only";

import { normalizeTrainingRecommendationInput } from "@/apps/team-os/services/training-ai/training-ai-input";
import { createDefaultTrainingAiProvider } from "@/apps/team-os/services/training-ai/training-ai-provider";
import type {
  TrainingAiDependencies,
  TrainingRecommendationInput,
  TrainingRecommendationResult
} from "@/apps/team-os/services/training-ai/types";

export async function recommendTraining(
  input: TrainingRecommendationInput,
  dependencies: TrainingAiDependencies = {}
): Promise<TrainingRecommendationResult> {
  const provider = dependencies.provider ?? createDefaultTrainingAiProvider();
  return provider.recommend(normalizeTrainingRecommendationInput(input));
}
