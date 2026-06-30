export type RuntimeV2OutputMode =
  | "auto"
  | "analysis"
  | "explain"
  | "faq"
  | "sop"
  | "customer_reply"
  | "sales_closing"
  | "sales_followup";

export type RuntimeV2AppType = "user_app";
export type RuntimeV2Channel = "chat-ui" | "knowledge-query";
export type RuntimeV2Platform = "web" | "exe" | "apk" | "unknown";

export interface RuntimeV2Input {
  query: string;
  userId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  appType: RuntimeV2AppType;
  channel: RuntimeV2Channel;
  platform: RuntimeV2Platform;
  outputMode: RuntimeV2OutputMode;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface RuntimeV2Source {
  id?: string;
  title?: string;
  type?: "knowledge" | "memory" | "faq" | "sop" | "case" | "risk" | "rag" | "unknown" | string;
  score?: number;
  snippet?: string;
  safeSnippet?: string;
  metadata?: Record<string, unknown>;
  sourceApp?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  contentPreview?: string;
}

export interface RuntimeV2Memory {
  id: string;
  title?: string;
  content: string;
  score?: number;
  agentId?: string | null;
  expertId?: string | null;
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  source?: string | null;
  sourceApp?: string | null;
  matchedBy?: string[];
  origin?: "explicit" | "source" | "artifact";
}

export interface RuntimeV2MemoryTraceItem {
  memoryId: string;
  title?: string;
  score?: number;
  matchedBy: string[];
  source?: string | null;
  applied: boolean;
  reason: string;
}

export interface RuntimeV2AgentPolicy {
  id: string;
  label: string;
  weight: number;
  instructions: string[];
}

export interface RuntimeV2Context {
  promptContext: string;
  usedMemoryIds: string[];
  memoryTrace: RuntimeV2MemoryTraceItem[];
  appliedAgentPolicies: string[];
}

export interface RuntimeV2Output {
  ok: boolean;
  answer: string;
  customerCopy: string;
  explanation?: string;
  sources: RuntimeV2Source[];
  traceId: string;
  confidence: number;
  nextStep: string;
  runtimeVersion: "v2";
  memoryApplied: boolean;
  usedMemoryIds: string[];
  memoryTrace: RuntimeV2MemoryTraceItem[];
  memoryWarnings?: string[];
  appliedAgentPolicies: string[];
  knowledgeBaseId?: string | null;
  kbId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  namespace?: string | null;
  tenantId?: string | null;
  errorCode?: string;
  reason?: string;
  raw?: unknown;
}
