import "server-only";

import { normalizeTrainingCourseContentInput } from "@/apps/team-os/services/training-ai/training-ai-input";
import { createDefaultTrainingAiProvider } from "@/apps/team-os/services/training-ai/training-ai-provider";
import type {
  GenerateTrainingCourseContentInput,
  TrainingAiDependencies,
  TrainingCourseContentResult
} from "@/apps/team-os/services/training-ai/types";

export async function generateTrainingCourseContent(
  input: GenerateTrainingCourseContentInput,
  dependencies: TrainingAiDependencies = {}
): Promise<TrainingCourseContentResult> {
  const provider = dependencies.provider ?? createDefaultTrainingAiProvider();
  return provider.generateCourseContent(normalizeTrainingCourseContentInput(input));
}
