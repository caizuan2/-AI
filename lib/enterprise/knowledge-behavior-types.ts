export type KnowledgeBehaviorEventType =
  | "answer_view"
  | "answer_dwell"
  | "answer_copy"
  | "source_click"
  | "save_knowledge"
  | "follow_up_question"
  | "regenerate_answer"
  | "agent_switch"
  | "second_question"
  | "feedback_up"
  | "feedback_down";

export interface KnowledgeBehaviorSignalInput {
  eventType: KnowledgeBehaviorEventType;
  userId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  chunkIds?: string[];
  evidenceIds?: string[];
  dwellMs?: number | null;
  source?: "admin_ingest" | "user_app" | string | null;
  eventAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeBehaviorScoreSignal {
  behaviorScoreDelta: number;
  reason: string;
}

export interface KnowledgeBehaviorRecordResult {
  status: "recorded" | "deduped";
  behaviorScoreDelta: number;
  rawBehaviorScoreDelta: number;
  decayWeight: number;
  affectedChunkCount: number;
  updatedChunkCount: number;
  updatedChunks: Array<{
    chunkId: string;
    behaviorScore: number;
    behaviorEventCount: number;
    behaviorScoreDelta: number;
    qualityScore: number | null;
    feedbackScore: number;
    usageScore: number;
    lowQuality: boolean;
    highValue: boolean;
  }>;
}
