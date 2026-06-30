export type KnowledgeRuntimeChannel = "chat-ui";

export type KnowledgeRuntimePlatform = "web" | "exe" | "apk";

export type KnowledgeRuntimeInput = {
  query: string;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  agentId?: string;
  expertId?: string;
  knowledgeBaseId?: string;
  kbId?: string;
  namespace?: string;
  tenantId?: string;
  appType: "user_app";
  channel: KnowledgeRuntimeChannel;
  platform: KnowledgeRuntimePlatform;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type KnowledgeRuntimeSource = {
  id?: string;
  title?: string;
  type?: "knowledge" | "memory" | "faq" | "sop" | "case" | "risk" | "rag" | "unknown";
  score?: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
};

export type KnowledgeRuntimeMemoryResult = {
  memories: KnowledgeRuntimeSource[];
  usedMemoryIds: string[];
  warning?: "MEMORY_RUNTIME_UNAVAILABLE" | "MEMORY_SCOPE_EMPTY";
};

export type KnowledgeRuntimeOutput = {
  ok: boolean;
  answer: string;
  customerCopy: string;
  explanation?: string;
  nextStep?: string;
  confidence?: number;
  sources: KnowledgeRuntimeSource[];
  usedMemoryIds?: string[];
  agentId?: string;
  expertId?: string;
  knowledgeBaseId?: string;
  kbId?: string;
  namespace?: string;
  tenantId?: string;
  traceId: string;
  errorCode?: string;
  reason?: string;
  raw?: unknown;
};
