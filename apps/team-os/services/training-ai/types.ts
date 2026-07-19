import type { IndustryKnowledgeContextResult } from "@/apps/team-os/services/knowledge-context";
import type { ChatProviderName } from "@/lib/ai/types";

export const TRAINING_COURSE_CATEGORIES = [
  "PRODUCT",
  "SALES",
  "CUSTOMER_SERVICE",
  "MANAGEMENT",
  "OTHER"
] as const;
export const TRAINING_COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const TRAINING_RECOMMENDATION_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const TRAINING_CUSTOMER_INTENTS = ["HIGH_INTENT", "HESITANT", "REGULAR", "CHURN_RISK"] as const;
export const TRAINING_CUSTOMER_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export type TrainingCourseCategory = (typeof TRAINING_COURSE_CATEGORIES)[number];
export type TrainingCourseLevel = (typeof TRAINING_COURSE_LEVELS)[number];
export type TrainingRecommendationPriority = (typeof TRAINING_RECOMMENDATION_PRIORITIES)[number];
export type TrainingCustomerIntent = (typeof TRAINING_CUSTOMER_INTENTS)[number];
export type TrainingCustomerRiskLevel = (typeof TRAINING_CUSTOMER_RISK_LEVELS)[number];

export interface TrainingAiRequestOptions {
  provider?: ChatProviderName;
  requestId?: string;
}

export interface TrainingEvaluationInput extends TrainingAiRequestOptions {
  question: string;
  answer: string;
  standard: string;
}

export interface TrainingEvaluationResult {
  score: number;
  feedback: string;
  suggestions: string[];
}

export interface TrainingSkillMetric {
  skill: string;
  averageScore: number;
  latestScore: number;
  sampleCount: number;
}

export interface TrainingReportMetrics {
  reportCount: number;
  averageScore: number;
  latestScore: number;
  /** Latest score minus the preceding-report average; positive means improving. */
  trend: number;
}

export interface TrainingCrmMetrics {
  profileCount: number;
  averagePurchaseProbability: number;
  intentDistribution: Partial<Record<TrainingCustomerIntent, number>>;
  riskDistribution: Partial<Record<TrainingCustomerRiskLevel, number>>;
}

export interface TrainingCourseReference {
  id: string;
  title: string;
  category: TrainingCourseCategory;
  level: TrainingCourseLevel;
  description?: string;
}

export interface TrainingRecommendationInput extends TrainingAiRequestOptions {
  skillMetrics: TrainingSkillMetric[];
  reportMetrics: TrainingReportMetrics;
  crmMetrics: TrainingCrmMetrics;
  courses?: TrainingCourseReference[];
}

export interface TrainingCourseRecommendation {
  courseId: string | null;
  title: string;
  reason: string;
  priority: TrainingRecommendationPriority;
  focusAreas: string[];
}

export interface TrainingRecommendationResult {
  summary: string;
  recommendations: TrainingCourseRecommendation[];
}

export interface TrainingSimulationCourse {
  title: string;
  description?: string;
  category: TrainingCourseCategory;
  level: TrainingCourseLevel;
  content: string;
}

export interface GenerateTrainingSimulationInput extends TrainingAiRequestOptions {
  course: TrainingSimulationCourse;
  knowledgeContext: IndustryKnowledgeContextResult;
}

export interface TrainingSimulationResult {
  question: string;
  standard: string;
}

export interface GenerateTrainingCourseContentInput extends TrainingAiRequestOptions {
  title: string;
  category: TrainingCourseCategory;
  level: TrainingCourseLevel;
  knowledgeContext: IndustryKnowledgeContextResult;
}

export interface TrainingCourseContentResult {
  description: string;
  content: string;
}

export interface TrainingAiProvider {
  evaluate(input: TrainingEvaluationInput): Promise<TrainingEvaluationResult>;
  recommend(input: TrainingRecommendationInput): Promise<TrainingRecommendationResult>;
  generateSimulation(input: GenerateTrainingSimulationInput): Promise<TrainingSimulationResult>;
  generateCourseContent(input: GenerateTrainingCourseContentInput): Promise<TrainingCourseContentResult>;
}

export interface TrainingAiDependencies {
  provider?: TrainingAiProvider;
}
