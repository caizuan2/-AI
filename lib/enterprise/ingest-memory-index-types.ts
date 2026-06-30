export type PublishedMemoryStatus = "published" | "shared" | "archived";

export type PublishedMemoryVisibility = "shared" | "public" | "private";

export type PublishedMemoryItem = {
  id: string;
  sourceDraftId?: string;
  title: string;
  type: string;
  content: string;
  summary?: string;
  tags?: string[];
  status: PublishedMemoryStatus;
  visibility: PublishedMemoryVisibility;
  knowledgeBaseId?: string;
  kbId?: string;
  agentId?: string;
  expertId?: string;
  namespace?: string;
  tenantId?: string;
  confidence?: number;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
  sourceApp: "admin_ingest";
  createdAt?: number;
  publishedAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
};

export type MemoryIndexEntry = {
  memoryId: string;
  sourceDraftId?: string;
  title: string;
  summary?: string;
  contentPreview: string;
  tags: string[];
  status: PublishedMemoryStatus;
  visibility: PublishedMemoryVisibility;
  knowledgeBaseId?: string;
  kbId?: string;
  agentId?: string;
  expertId?: string;
  namespace?: string;
  tenantId?: string;
  sourceApp: "admin_ingest";
  searchText: string;
  tokens: string[];
  updatedAt: number;
};

export type PublishedMemoryState = {
  source: string;
  version: 1;
  memories: PublishedMemoryItem[];
  updatedAt: number;
  warnings?: string[];
};

export type MemoryIndexState = {
  source: string;
  version: 1;
  entries: MemoryIndexEntry[];
  builtAt: number;
  warnings?: string[];
};

export type RuntimeMemorySearchInput = {
  query: string;
  knowledgeBaseId?: string;
  kbId?: string;
  agentId?: string;
  expertId?: string;
  namespace?: string;
  tenantId?: string;
  limit?: number;
};

export type RuntimeMemorySearchResultItem = {
  memoryId: string;
  title: string;
  summary?: string;
  contentPreview: string;
  score: number;
  reason: string;
  matchedTokens: string[];
  sourceApp: "admin_ingest";
  knowledgeBaseId?: string;
  kbId?: string;
  agentId?: string;
  expertId?: string;
  namespace?: string;
  tenantId?: string;
};
