import "server-only";

import type { IngestChatAgent, IngestChatMessage, IngestKnowledgeDraft } from "@/lib/enterprise/mock-chat";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";

export type AdminIngestConversationSyncState = {
  source: "admin-ingest-conversation-sync-v1";
  version: 1;
  ownerUserId: string;
  agents: IngestChatAgent[];
  agentConversations: IngestAgentConversation[];
  activeAgentId: string;
  activeConversationId: string;
  conversationMessagesById: Record<string, IngestChatMessage[]>;
  conversationDraftsById: Record<string, IngestKnowledgeDraft>;
  pinnedAgentIds: string[];
  expandedAgentIds: string[];
  expandedConversationAgentIds: string[];
  updatedAt: number;
};

export function createEmptyAdminIngestConversationSyncState(ownerUserId: string): AdminIngestConversationSyncState {
  return {
    source: "admin-ingest-conversation-sync-v1",
    version: 1,
    ownerUserId,
    agents: [],
    agentConversations: [],
    activeAgentId: "",
    activeConversationId: "",
    conversationMessagesById: {},
    conversationDraftsById: {},
    pinnedAgentIds: [],
    expandedAgentIds: [],
    expandedConversationAgentIds: [],
    updatedAt: Date.now()
  };
}

function readEnvConversationDir(): string {
  return (process.env.ADMIN_INGEST_CONVERSATION_DIR || process.env.AI_KB_ADMIN_INGEST_CONVERSATION_DIR || "").trim();
}

function safeOwnerId(ownerUserId: string) {
  return ownerUserId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}

async function getAdminIngestConversationDir() {
  const path = await import("node:path");
  const envDir = readEnvConversationDir();

  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
  }

  if (process.platform !== "win32" && process.cwd().startsWith("/var/www/ai-knowledge-main-")) {
    return "/var/www/ai-knowledge-shared/admin-ingest/conversations";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "conversations");
}

async function getConversationSyncFilePath(ownerUserId: string) {
  const path = await import("node:path");
  const dir = await getAdminIngestConversationDir();

  return path.join(dir, `user-${safeOwnerId(ownerUserId)}.json`);
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, T>
    : {};
}

function normalizeState(ownerUserId: string, value: Partial<AdminIngestConversationSyncState> | null): AdminIngestConversationSyncState {
  const fallback = createEmptyAdminIngestConversationSyncState(ownerUserId);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    ...fallback,
    ...value,
    source: "admin-ingest-conversation-sync-v1",
    version: 1,
    ownerUserId,
    agents: normalizeArray<IngestChatAgent>(value.agents),
    agentConversations: normalizeArray<IngestAgentConversation>(value.agentConversations),
    activeAgentId: typeof value.activeAgentId === "string" ? value.activeAgentId : "",
    activeConversationId: typeof value.activeConversationId === "string" ? value.activeConversationId : "",
    conversationMessagesById: normalizeRecord<IngestChatMessage[]>(value.conversationMessagesById),
    conversationDraftsById: normalizeRecord<IngestKnowledgeDraft>(value.conversationDraftsById),
    pinnedAgentIds: normalizeArray<string>(value.pinnedAgentIds),
    expandedAgentIds: normalizeArray<string>(value.expandedAgentIds),
    expandedConversationAgentIds: normalizeArray<string>(value.expandedConversationAgentIds),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now()
  };
}

export async function readAdminIngestConversationSyncState(ownerUserId: string) {
  try {
    const fs = await import("node:fs/promises");
    const filePath = await getConversationSyncFilePath(ownerUserId);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminIngestConversationSyncState>;

    return normalizeState(ownerUserId, parsed);
  } catch {
    return createEmptyAdminIngestConversationSyncState(ownerUserId);
  }
}

export async function writeAdminIngestConversationSyncState(ownerUserId: string, state: Partial<AdminIngestConversationSyncState>) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = await getConversationSyncFilePath(ownerUserId);
  const normalized = normalizeState(ownerUserId, {
    ...state,
    ownerUserId,
    updatedAt: Date.now()
  });

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}
