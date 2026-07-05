import type {
  IngestMemoryExtractionInput,
  IngestMemoryExtractionResult,
  IngestMemoryItem,
  IngestMemoryType
} from "@/lib/enterprise/ingest-memory-types";

const TYPE_RULES: Array<{
  type: IngestMemoryType;
  keywords: string[];
  category: string;
  tags: string[];
}> = [
  { type: "sop", keywords: ["步骤", "SOP", "执行", "流程", "操作"], category: "SOP", tags: ["流程", "执行"] },
  { type: "script", keywords: ["话术", "客户说", "怎么回复", "回复客户", "可复制"], category: "销售话术", tags: ["话术", "客户沟通"] },
  { type: "faq", keywords: ["客户问", "为什么", "怎么办", "如何", "问题"], category: "FAQ", tags: ["问答"] },
  { type: "risk", keywords: ["风险", "禁忌", "合规", "不能说", "不要承诺", "注意"], category: "风险边界", tags: ["风险", "合规"] },
  { type: "case", keywords: ["案例", "张先生", "李女士", "客户A", "真实场景"], category: "案例", tags: ["案例"] },
  { type: "objection", keywords: ["异议", "反驳", "不相信", "没效果", "太贵", "犹豫"], category: "异议处理", tags: ["异议处理"] },
  { type: "strategy", keywords: ["策略", "打法", "路径", "定位", "转化", "成交"], category: "策略", tags: ["策略"] },
  { type: "agent_preference", keywords: ["以后", "记住", "偏好", "按这个风格", "不要这样"], category: "Agent偏好", tags: ["偏好"] }
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function makeHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function clipText(value: string, maxLength: number) {
  const text = normalizeText(value);

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function splitCandidates(text: string) {
  return text
    .split(/\n{2,}|(?=##\s)|(?=\d+[.、]\s)|(?=[-*]\s)/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length >= 18)
    .slice(0, 16);
}

function matchType(text: string) {
  const normalized = text.toLowerCase();
  let best = TYPE_RULES[0];
  let score = 0;

  for (const rule of TYPE_RULES) {
    const nextScore = rule.keywords.reduce((total, keyword) => {
      return normalized.includes(keyword.toLowerCase()) ? total + 1 : total;
    }, 0);

    if (nextScore > score) {
      best = rule;
      score = nextScore;
    }
  }

  if (score === 0) {
    return {
      ...TYPE_RULES.find((rule) => rule.type === "training_note") ?? {
        type: "training_note" as const,
        keywords: [],
        category: "训练笔记",
        tags: ["训练笔记"]
      },
      score: 0
    };
  }

  return { ...best, score };
}

function createTitle(text: string, type: IngestMemoryType) {
  const clean = clipText(text.replace(/[：:。.!！?？].*$/, ""), 34);
  const typeLabel: Record<IngestMemoryType, string> = {
    fact: "事实记忆",
    strategy: "策略记忆",
    script: "客户话术",
    faq: "问答记忆",
    sop: "执行SOP",
    risk: "风险边界",
    case: "案例记忆",
    objection: "异议处理",
    training_note: "训练笔记",
    agent_preference: "Agent偏好"
  };

  return clean || typeLabel[type];
}

function uniqueByContent(items: IngestMemoryItem[]) {
  const seen = new Set<string>();
  const result: IngestMemoryItem[] = [];

  for (const item of items) {
    const key = makeHash(`${item.type}:${item.content.slice(0, 140)}`);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export function extractMemoriesFromConversation(input: IngestMemoryExtractionInput): IngestMemoryExtractionResult {
  const now = Date.now();
  const recentMessages = input.messages.slice(-12);
  const messageText = recentMessages
    .map((message) => `${message.role ?? "message"}：${normalizeText(message.content)}`)
    .filter((line) => line.length > 6)
    .join("\n");
  const latestReply = normalizeText(input.latestAssistantReply);
  const instruction = normalizeText(input.userInstruction);
  const sourceText = [instruction, latestReply, messageText].filter(Boolean).join("\n\n");
  const warnings: string[] = [];

  if (!sourceText) {
    return {
      ok: true,
      conversationId: input.conversationId,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      memories: [],
      draftCandidates: [],
      learningSummary: "暂无可提取的训练记忆。",
      warnings: ["NO_SOURCE_TEXT"]
    };
  }

  const candidates = splitCandidates(sourceText);
  const memories = uniqueByContent(candidates.map((candidate, index) => {
    const rule = matchType(candidate);
    const confidence = Math.min(0.96, 0.55 + rule.score * 0.12 + (input.saveIntent ? 0.08 : 0));
    const tags = Array.from(new Set([
      ...rule.tags,
      ...(candidate.includes("客户") ? ["客户"] : []),
      ...(candidate.includes("成交") || candidate.includes("转化") ? ["转化"] : []),
      ...(candidate.includes("PPT") ? ["PPT"] : [])
    ])).slice(0, 6);

    return {
      id: `mem-${input.conversationId}-${now}-${index}-${makeHash(candidate)}`,
      type: rule.type,
      title: createTitle(candidate, rule.type),
      content: clipText(candidate, 900),
      summary: clipText(candidate, 120),
      sourceConversationId: input.conversationId,
      sourceMessageIds: recentMessages.map((message) => message.id).filter((id): id is string => Boolean(id)),
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      ownerAdminId: input.ownerAdminId,
      ownerUserId: input.ownerUserId,
      tags,
      category: rule.category,
      confidence,
      status: confidence >= 0.72 ? "draft" as const : "suggested_merge" as const,
      createdAt: now,
      meta: {
        source: "admin-ingest-memory-layer-v1",
        ownerAdminId: input.ownerAdminId,
        ownerUserId: input.ownerUserId,
        ruleScore: rule.score
      }
    };
  })).slice(0, 8);

  if (memories.length === 0) {
    warnings.push("NO_MEMORY_CANDIDATES");
  }

  const draftCandidates = memories
    .filter((memory) => memory.confidence >= 0.66)
    .map((memory) => ({ ...memory, status: "draft" as const }));
  const topicTitles = memories.slice(0, 4).map((memory) => memory.title).join("、");

  return {
    ok: true,
    conversationId: input.conversationId,
    agentId: input.agentId,
    knowledgeBaseId: input.knowledgeBaseId,
    memories,
    draftCandidates,
    learningSummary: topicTitles ? `本轮沉淀了 ${topicTitles} 等训练记忆。` : "本轮暂未形成高置信训练记忆。",
    warnings
  };
}
