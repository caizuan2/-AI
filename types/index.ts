export type KnowledgeStatus = "active" | "stale" | "archived" | "synced" | "draft" | "processing";

export type FeedStatus = "queued" | "processing" | "completed" | "failed";

export type KnowledgeChunk = {
  id: string;
  title: string;
  speaker?: string;
  content: string;
  createdAt: string;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  category: string;
  owner: string;
  status: KnowledgeStatus;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  chunks: KnowledgeChunk[];
  relatedQuestions: string[];
};

export type FeedRecord = {
  id: string;
  title: string;
  source: string;
  contentPreview: string;
  tags: string[];
  status: FeedStatus;
  createdAt: string;
};
