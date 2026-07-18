export { evaluateTraining } from "@/apps/team-os/services/training-ai/evaluate-training";
export { recommendTraining } from "@/apps/team-os/services/training-ai/recommend-training";
export { generateTrainingSimulation } from "@/apps/team-os/services/training-ai/generate-training-simulation";
export { generateTrainingCourseContent } from "@/apps/team-os/services/training-ai/generate-training-course-content";
export {
  createDefaultTrainingAiProvider,
  parseTrainingCourseContentResponse,
  parseTrainingEvaluationResponse,
  parseTrainingRecommendationResponse,
  parseTrainingSimulationResponse
} from "@/apps/team-os/services/training-ai/training-ai-provider";
export {
  buildEvaluateTrainingPrompt,
  buildRecommendTrainingPrompt,
  buildTrainingCourseContentPrompt,
  buildTrainingSimulationPrompt
} from "@/apps/team-os/services/training-ai/training-ai-prompts";
export {
  normalizeTrainingCourseContentInput,
  normalizeTrainingEvaluationInput,
  normalizeTrainingRecommendationInput,
  normalizeTrainingSimulationInput
} from "@/apps/team-os/services/training-ai/training-ai-input";
export {
  TRAINING_COURSE_CATEGORIES,
  TRAINING_COURSE_LEVELS,
  TRAINING_CUSTOMER_INTENTS,
  TRAINING_CUSTOMER_RISK_LEVELS,
  TRAINING_RECOMMENDATION_PRIORITIES
} from "@/apps/team-os/services/training-ai/types";
export type {
  GenerateTrainingCourseContentInput,
  GenerateTrainingSimulationInput,
  TrainingAiDependencies,
  TrainingAiProvider,
  TrainingAiRequestOptions,
  TrainingCourseCategory,
  TrainingCourseContentResult,
  TrainingCourseLevel,
  TrainingCourseRecommendation,
  TrainingCourseReference,
  TrainingCrmMetrics,
  TrainingCustomerIntent,
  TrainingCustomerRiskLevel,
  TrainingEvaluationInput,
  TrainingEvaluationResult,
  TrainingRecommendationInput,
  TrainingRecommendationPriority,
  TrainingRecommendationResult,
  TrainingReportMetrics,
  TrainingSimulationCourse,
  TrainingSimulationResult,
  TrainingSkillMetric
} from "@/apps/team-os/services/training-ai/types";
