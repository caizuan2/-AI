import { generateKnowledgePatch, type KnowledgePatch } from "./knowledge_patch_generator";
import { createPendingRepairQueueItem, type RepairQueueItem } from "./repair_queue";
import { optimizeRagChunk, type RagChunkRepairSuggestion, type UserNegativeFeedback } from "./rag_self_optimizer";
import { decideRepairStrategy, type RepairStrategy } from "./repair_strategy_engine";

export interface RepairSchedulerInput {
  query: string;
  relevanceScore: number;
  hitCount: number;
  answerGroundingScore: number;
  fallbackUsed: boolean;
  providerStatus?: string;
  gapEvent?: unknown;
  oldChunk?: string;
  userFeedback?: UserNegativeFeedback;
}

export interface RepairScheduleResult {
  strategy: RepairStrategy;
  queue: Array<RepairQueueItem<KnowledgePatch | RagChunkRepairSuggestion>>;
}

export function scheduleRepairReview(input: RepairSchedulerInput): RepairScheduleResult {
  const strategy = decideRepairStrategy(input);
  const queue: Array<RepairQueueItem<KnowledgePatch | RagChunkRepairSuggestion>> = [];
  const lowQualityDetected = input.relevanceScore < 0.3 ||
    input.hitCount === 0 ||
    input.answerGroundingScore < 0.35 ||
    input.fallbackUsed ||
    input.userFeedback === "dislike" ||
    input.userFeedback === "unsatisfied" ||
    input.userFeedback === "negative";

  if (!input.gapEvent && !lowQualityDetected) {
    return {
      strategy,
      queue,
    };
  }

  const knowledgePatch = generateKnowledgePatch({
    sourceQuestion: input.query,
    priority: input.hitCount === 0 ? "high" : "medium",
  });

  if (knowledgePatch) {
    queue.push(createPendingRepairQueueItem(knowledgePatch));
  }

  const ragSuggestion = optimizeRagChunk({
    query: input.query,
    oldChunk: input.oldChunk,
    relevanceScore: input.relevanceScore,
    hitCount: input.hitCount,
    userFeedback: input.userFeedback,
  });

  if (ragSuggestion) {
    queue.push(createPendingRepairQueueItem(ragSuggestion));
  }

  return {
    strategy,
    queue,
  };
}
