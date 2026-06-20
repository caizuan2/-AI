import type {
  AdminIngestPlatform,
  AdminIngestSyncTarget
} from "@/lib/enterprise/admin-ingest-app-config";
import type { GptUserClientCallPlan } from "@/lib/enterprise/gpt-user-client-call-plan";

export type IngestChatAgentTone = "green" | "blue" | "amber" | "rose" | "slate";
export type IngestChatAgentStatus = "active" | "archived" | "deleted_local";
export type IngestChatAgentSource = "super_admin_category" | "ingest_custom" | "expert_marketplace";

export interface IngestChatAgent {
  id: string;
  expertId?: string | null;
  name: string;
  role: string;
  description: string;
  avatar: string;
  tone: IngestChatAgentTone;
  category?: string;
  tenantId?: string | null;
  userId?: string | null;
  platform?: AdminIngestPlatform;
  syncTarget?: AdminIngestSyncTarget[];
  createdAt?: string;
  status?: IngestChatAgentStatus;
  isSystem?: boolean;
  knowledgeCount?: number;
  source?: IngestChatAgentSource;
  sourceApp?: "admin_ingest";
  managedBySuperAdmin?: boolean;
  editableByIngestAdmin?: boolean;
  deletableByIngestAdmin?: boolean;
  visibleToUserClient?: boolean;
}

export interface IngestChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    isImage?: boolean;
    previewUrl?: string;
    extractedText?: string;
    summary?: string;
    mimeType?: string;
    parseStatus?: "parsed" | "partial" | "metadata_only" | "unsupported" | "ocr_pending";
    pageSummaries?: string[];
    slideTexts?: Array<{ slideIndex: number; text: string }>;
    limitationNote?: string;
    status: "selected" | "pending_parse" | "ready_to_send" | "parsing" | "attached" | "parsed" | "failed";
    source: "admin_ingest";
    platform: AdminIngestPlatform;
    syncTarget: AdminIngestSyncTarget[];
    tenantId?: string | null;
    userId?: string | null;
    agentId?: string | null;
    createdAt: string;
  }>;
  source?: "admin_ingest";
  platform?: AdminIngestPlatform;
  syncTarget?: AdminIngestSyncTarget[];
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  conversationId?: string | null;
  agentName?: string | null;
  expertName?: string | null;
  model?: string;
  provider?: string;
  saveSuggestion?: boolean;
}

export interface IngestKnowledgeDraft {
  id: string;
  jobId?: string | null;
  title: string;
  category: string;
  categories?: string[];
  tags: string[];
  summary?: string;
  qaPairs?: Array<{ q: string; a: string }>;
  standardQuestion: string;
  standardAnswer: string;
  standardQuestions?: string[];
  standardAnswers?: string[];
  trainingScore: number;
  recommendation: "建议入库" | "需要复核" | "暂不入库";
  saveStatus: "待确认" | "已保存" | "已拒绝";
  sourceType?: "chat" | "text" | "file" | "image" | "url";
  scenarios?: string[];
  sourceMaterials?: string[];
  complianceNotes?: string[];
  missingFields?: string[];
  suggestedQuestions?: string[];
  userClientCallPlan?: GptUserClientCallPlan;
  saveRecommendation?: string;
  sourceModel?: string;
  generatedBy?: string;
  providerUsed?: string;
  model?: string;
  modelMode?: "highest" | "fixed";
  replyMarkdown?: string;
  fallbackUsed?: boolean;
}

export interface IngestTrainingRecord {
  id: string;
  jobId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  expertId?: string | null;
  agentName?: string | null;
  expertName?: string | null;
  input: string;
  resultTitle: string;
  saveStatus: "待确认" | "已保存" | "已拒绝" | "失败";
  category: string;
  time: string;
  hits: number;
  sourceType?: string;
  source?: "admin_ingest";
  platform?: AdminIngestPlatform;
  syncTarget?: AdminIngestSyncTarget[];
  createdAt?: string;
  updatedAt?: string;
  aiOutput?: IngestKnowledgeDraft | null;
}

const superAdminAgentMeta = {
  source: "super_admin_category" as const,
  managedBySuperAdmin: true,
  editableByIngestAdmin: false,
  deletableByIngestAdmin: false,
  visibleToUserClient: true
};

export const ingestChatAgents: IngestChatAgent[] = [
  {
    id: "chief",
    name: "知识生产主管",
    role: "默认 Agent",
    description: "把原始材料整理成标题、分类、标签和标准问答。",
    avatar: "知",
    tone: "green",
    knowledgeCount: 128,
    ...superAdminAgentMeta
  },
  {
    id: "product",
    name: "产品 Agent",
    role: "产品知识库",
    description: "适合功能说明、版本差异、FAQ 和使用边界。",
    avatar: "产",
    tone: "blue",
    knowledgeCount: 86,
    ...superAdminAgentMeta
  },
  {
    id: "service",
    name: "客服 Agent",
    role: "客服话术库",
    description: "适合客户解释、异议处理和可复制回复。",
    avatar: "客",
    tone: "amber",
    knowledgeCount: 213,
    ...superAdminAgentMeta
  },
  {
    id: "after-sale",
    name: "售后 Agent",
    role: "售后知识库",
    description: "适合退款、换货、保修和工单处理流程。",
    avatar: "售",
    tone: "rose",
    knowledgeCount: 74,
    ...superAdminAgentMeta
  },
  {
    id: "policy",
    name: "制度 Agent",
    role: "企业制度库",
    description: "适合制度流程、审批规范和内部执行口径。",
    avatar: "制",
    tone: "slate",
    knowledgeCount: 51,
    ...superAdminAgentMeta
  },
  {
    id: "sales",
    name: "销售 Agent",
    role: "销售知识库",
    description: "适合客户需求挖掘、报价说明和成交推进知识。",
    avatar: "销",
    tone: "green",
    knowledgeCount: 97,
    ...superAdminAgentMeta
  }
];

export const ingestChatSeedMessages: IngestChatMessage[] = [
  {
    id: "seed-1",
    role: "assistant",
    content: "把要投喂的内容发给我。我会按“AI解析 → 知识结构化 → 分类标签 → 标准问答 → 保存建议 → 训练记录”的流程生成 mock 结果。",
    time: "09:30"
  },
  {
    id: "seed-2",
    role: "user",
    content: "客户申请退款时，需要先核对订单状态、付款渠道和是否已经发货。",
    time: "09:32"
  },
  {
    id: "seed-3",
    role: "assistant",
    content: "已解析为售后知识点：退款前置核验流程。建议入库到售后知识库，并生成标准问答用于客服回复。",
    time: "09:32"
  }
];

export const ingestChatInitialDraft: IngestKnowledgeDraft = {
  id: "draft-seed",
  title: "退款前置核验流程",
  category: "售后知识库",
  tags: ["退款", "订单核验", "客服 SOP"],
  summary: "客服处理退款申请前，应先核对订单状态、付款渠道和是否已经发货。",
  qaPairs: [
    {
      q: "客户申请退款时，客服需要先核对哪些信息？",
      a: "客服应先核对订单状态、付款渠道以及商品是否已经发货，再判断可走的退款处理流程，并保留处理记录。"
    }
  ],
  standardQuestion: "客户申请退款时，客服需要先核对哪些信息？",
  standardAnswer: "客服应先核对订单状态、付款渠道以及商品是否已经发货，再判断可走的退款处理流程，并保留处理记录。",
  trainingScore: 91,
  recommendation: "建议入库",
  saveStatus: "待确认"
};

export const ingestTrainingRecords: IngestTrainingRecord[] = [
  {
    id: "record-1",
    input: "客户申请退款前置核验",
    resultTitle: "退款前置核验流程",
    saveStatus: "待确认",
    category: "售后知识库",
    time: "09:32",
    hits: 18
  },
  {
    id: "record-2",
    input: "产品套餐权益变更说明",
    resultTitle: "新版套餐权益说明",
    saveStatus: "已保存",
    category: "产品知识库",
    time: "昨天",
    hits: 43
  },
  {
    id: "record-3",
    input: "客户价格异议处理话术",
    resultTitle: "价格异议标准回复",
    saveStatus: "已保存",
    category: "客服话术库",
    time: "周一",
    hits: 67
  }
];

export function createMockKnowledgeDraft(input: string, agent: IngestChatAgent): IngestKnowledgeDraft {
  const normalized = input.trim();
  const category = agent.id === "chief" ? inferCategory(normalized) : agent.role;
  const title = inferTitle(normalized, category);
  const tags = inferTags(normalized, category);
  const score = Math.min(97, Math.max(72, 78 + Math.round(normalized.length / 8)));

  return {
    id: `draft-${Date.now()}`,
    title,
    category,
    tags,
    standardQuestion: `关于“${title}”，一线人员应该如何处理？`,
    standardAnswer: `建议先确认场景和前置条件，再按“核对信息 → 判断规则 → 给出标准回复 → 记录来源”的步骤处理。原始材料：${normalized}`,
    trainingScore: score,
    recommendation: score >= 82 ? "建议入库" : "需要复核",
    saveStatus: "待确认"
  };
}

function inferCategory(input: string) {
  if (/退款|售后|换货|保修|工单/.test(input)) {
    return "售后知识库";
  }
  if (/价格|话术|客户|异议|回复/.test(input)) {
    return "客服话术库";
  }
  if (/产品|功能|版本|套餐/.test(input)) {
    return "产品知识库";
  }
  if (/制度|审批|流程|规范/.test(input)) {
    return "企业制度库";
  }
  return "默认知识库";
}

function inferTitle(input: string, category: string) {
  if (/退款/.test(input)) {
    return "退款处理标准知识";
  }
  if (/价格|异议/.test(input)) {
    return "客户异议处理知识";
  }
  if (/套餐|产品|功能/.test(input)) {
    return "产品功能说明知识";
  }
  if (/制度|审批/.test(input)) {
    return "企业制度执行知识";
  }
  return `${category.replace("知识库", "")}投喂知识`;
}

function inferTags(input: string, category: string) {
  const tags = new Set<string>();

  if (/退款|售后/.test(input)) {
    tags.add("退款");
    tags.add("售后");
  }
  if (/客户|客服|话术/.test(input)) {
    tags.add("客服话术");
  }
  if (/产品|功能|套餐/.test(input)) {
    tags.add("产品");
  }
  if (/制度|审批|流程/.test(input)) {
    tags.add("流程规范");
  }

  tags.add(category.replace("知识库", ""));

  return Array.from(tags).slice(0, 4);
}
