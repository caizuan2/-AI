export type IngestMemoryType =
  | "fact"
  | "strategy"
  | "script"
  | "faq"
  | "sop"
  | "risk"
  | "case"
  | "objection"
  | "training_note"
  | "agent_preference";

export type IngestMemoryStatus = "draft" | "suggested_merge" | "confirmed" | "rejected" | "saved";

export type IngestMemoryItem = {
  id: string;
  type: IngestMemoryType;
  title: string;
  content: string;
  summary?: string;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  tags?: string[];
  category?: string;
  confidence: number;
  status: IngestMemoryStatus;
  createdAt: number;
  updatedAt?: number;
  meta?: Record<string, unknown>;
};

export type IngestMemoryExtractionResult = {
  ok: boolean;
  conversationId: string;
  agentId?: string;
  knowledgeBaseId?: string;
  memories: IngestMemoryItem[];
  draftCandidates: IngestMemoryItem[];
  learningSummary?: string;
  warnings?: string[];
};

export type IngestDraftMergePlan = {
  ok: boolean;
  sourceIds: string[];
  mergedTitle: string;
  mergedContent: string;
  mergedSummary?: string;
  duplicateRisk: "low" | "medium" | "high";
  reason: string;
  tags?: string[];
  category?: string;
};

export type IngestAgentLearningState = {
  agentId: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  learnedTopics: string[];
  preferredAnswerStyle?: string;
  riskBoundaries?: string[];
  recentCorrections?: string[];
  updatedAt: number;
};

export type IngestMemoryConversationMessage = {
  id?: string;
  role?: "user" | "assistant" | "system" | string;
  content?: string;
};

export type IngestMemoryExtractionInput = {
  conversationId: string;
  agentId?: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  messages: IngestMemoryConversationMessage[];
  latestAssistantReply?: string;
  userInstruction?: string;
  saveIntent?: boolean;
};

export type IngestAgentLearningEvent = {
  id: string;
  agentId: string;
  knowledgeBaseId?: string;
  ownerAdminId?: string;
  ownerUserId?: string;
  conversationId?: string;
  summary: string;
  topics: string[];
  riskBoundaries: string[];
  corrections: string[];
  createdAt: number;
  source: "admin-ingest-memory-layer-v1";
};

export type IngestMemoryPanelSummary = {
  ok: boolean;
  ownerAdminId?: string;
  includesLegacyUnowned?: boolean;
  memoryCount: number;
  draftCount: number;
  recentTopics: string[];
  memories: IngestMemoryItem[];
  draftCandidates: IngestMemoryItem[];
  agentLearning: IngestAgentLearningState | null;
  mergeSuggestions: IngestDraftMergePlan[];
  warnings?: string[];
};

export type IngestMemoryRecallCandidate = {
  memory: IngestMemoryItem;
  score: number;
  reason: string;
  matchedFields: string[];
  injected?: boolean;
};

export type IngestMemoryRetrieveResult = {
  ok: boolean;
  query: string;
  memories: IngestMemoryRecallCandidate[];
  warnings?: string[];
};

export type IngestMemoryConflictLevel = "none" | "low" | "medium" | "high";

export type IngestMemoryConflictItem = {
  memoryId: string;
  reason: string;
  field: string;
  suggestion: string;
};

export type IngestMemoryConflictResult = {
  hasConflict: boolean;
  conflictLevel: IngestMemoryConflictLevel;
  conflicts: IngestMemoryConflictItem[];
};

export type IngestMemoryPromptContext = {
  memoryContextText: string;
  usedMemoryIds: string[];
  warnings?: string[];
};

export type IngestAgentLearningInstruction = {
  instructionText: string;
  appliedPolicies: string[];
  warnings?: string[];
};
