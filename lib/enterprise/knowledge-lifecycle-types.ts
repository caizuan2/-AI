import "server-only";

export type KnowledgeLifecycleStage =
  | "new"
  | "growing"
  | "stable"
  | "declining"
  | "archive_candidate"
  | "unknown";

export type KnowledgeLifecycleSignal = {
  lifecycleStage: KnowledgeLifecycleStage;
  lifecycleScore: number;
  lifecycleConfidence: number;
  lifecycleReason: string;
  lifecycleSuggestion: string;
  shouldBoost: boolean;
  shouldDecay: boolean;
  shouldReview: boolean;
  shouldArchiveCandidate: boolean;
};
