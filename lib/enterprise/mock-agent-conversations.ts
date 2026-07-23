import type {
  AdminIngestPlatform,
  AdminIngestSyncTarget
} from "@/lib/enterprise/admin-ingest-app-config";
import type {
  IngestChatAgent,
  IngestChatMessage
} from "@/lib/enterprise/mock-chat";

export interface IngestAgentConversation {
  id: string;
  agentId: string;
  expertId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  updatedLabel: string;
  messageCount: number;
  pinned?: boolean;
  status: "active" | "archived";
  publicAccess?: {
    share?: {
      token: string;
      url: string;
      status: "active" | "revoked";
      updatedAt: string;
    };
    groupChat?: {
      token: string;
      url: string;
      status: "active" | "revoked";
      updatedAt: string;
    };
  };
  source: "admin_ingest";
  platform: AdminIngestPlatform;
  syncTarget: AdminIngestSyncTarget[];
}

const defaultSyncTarget: AdminIngestSyncTarget[] = ["web", "exe", "apk"];

export const seedConversationTitles = [
  "未来财富PPT学习",
  "脑达人",
  "我是做直销的，我的公司名…",
  "客户退货话术优化",
  "产品卖点整理",
  "售后处理SOP"
];

export function createAgentConversation(input: {
  agent: IngestChatAgent;
  title?: string;
  platform: AdminIngestPlatform;
  syncTarget: AdminIngestSyncTarget[];
}): IngestAgentConversation {
  const now = new Date().toISOString();

  return {
    id: `conv-${input.agent.id}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    agentId: input.agent.id,
    expertId: input.agent.expertId ?? null,
    title: input.title ?? "新对话",
    createdAt: now,
    updatedAt: now,
    updatedLabel: "刚刚",
    messageCount: 0,
    status: "active",
    source: "admin_ingest",
    platform: input.platform,
    syncTarget: [...input.syncTarget]
  };
}

export function createSeedAgentConversations(agent: IngestChatAgent): IngestAgentConversation[] {
  const platform = agent.platform ?? "web";
  const syncTarget = agent.syncTarget ?? defaultSyncTarget;

  return seedConversationTitles.map((title, index) => ({
    id: `conv-${agent.id}-seed-${index + 1}`,
    agentId: agent.id,
    expertId: agent.expertId ?? null,
    title,
    createdAt: new Date(Date.now() - (index + 1) * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - index * 1800_000).toISOString(),
    updatedLabel: index === 0 ? "刚刚" : index === 1 ? "18分钟前" : index === 2 ? "今天" : "昨天",
    messageCount: Math.max(1, 8 - index),
    status: "active" as const,
    source: "admin_ingest" as const,
    platform,
    syncTarget: [...syncTarget]
  }));
}

export function createConversationMessages(input: {
  conversation: IngestAgentConversation;
  agent: IngestChatAgent;
}): IngestChatMessage[] {
  const base = {
    source: "admin_ingest" as const,
    platform: input.conversation.platform,
    syncTarget: [...input.conversation.syncTarget],
    tenantId: input.agent.tenantId ?? null,
    userId: input.agent.userId ?? null,
    agentId: input.agent.id,
    expertId: input.agent.expertId ?? null,
    agentName: input.agent.name,
    expertName: input.agent.expertId ? input.agent.name : null,
    conversationId: input.conversation.id,
    provider: "admin_ingest"
  };

  if (input.conversation.messageCount === 0 || input.conversation.title === "新对话") {
    return [];
  }

  return [
    {
      id: `${input.conversation.id}-user`,
      role: "user",
      content: `请把「${input.conversation.title}」整理成可投喂的知识内容。`,
      time: input.conversation.updatedLabel,
      ...base
    },
    {
      id: `${input.conversation.id}-assistant`,
      role: "assistant",
      content: `已进入「${input.agent.name}」下的投喂对话：${input.conversation.title}。可以继续补充材料，我会生成结构化知识、分类标签和标准问答。`,
      time: input.conversation.updatedLabel,
      model: "GPT-5.5 超高",
      saveSuggestion: true,
      ...base
    }
  ];
}

export function deriveConversationTitle(input: string, fileName?: string) {
  if (fileName) {
    if (/\.pptx?$/i.test(fileName)) {
      return "PPT内容学习";
    }

    if (/\.pdf$/i.test(fileName)) {
      return "产品文档解析";
    }

    return fileName.replace(/\.[^.]+$/, "").slice(0, 16) || "文件投喂";
  }

  const normalized = input.trim().replace(/\s+/g, "");

  return normalized.slice(0, 16) || "新对话";
}
