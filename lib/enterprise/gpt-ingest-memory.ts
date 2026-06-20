import type { GptKnowledgeDraft } from "@/lib/enterprise/gpt-knowledge-draft";
import { buildIngestFileContextPrompt } from "@/lib/enterprise/ingest-file-context";

export interface GptIngestMemoryAttachment {
  fileName: string;
  fileType?: string;
  mimeType?: string;
  fileSize?: number;
  sizeBytes?: number;
  status?: string;
  parseStatus?: string;
  extractedText?: string;
  text?: string;
  content?: string;
  visibleText?: string;
  summary?: string;
  pageSummaries?: string[];
  limitationNote?: string;
}

export interface GptIngestMemoryMessage {
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  provider?: string | null;
}

export interface GptIngestMemoryRecord {
  input?: string;
  resultTitle?: string;
  category?: string;
  saveStatus?: string;
}

export interface GptIngestMemoryInput {
  currentInput?: string;
  currentAgent?: {
    agentId?: string | null;
    expertId?: string | null;
    agentName?: string | null;
    category?: string | null;
    description?: string | null;
    targetUser?: string | null;
  };
  recentMessages?: GptIngestMemoryMessage[];
  uploadedAttachments?: GptIngestMemoryAttachment[];
  previousKnowledgeDrafts?: Array<Partial<GptKnowledgeDraft>>;
  recentTrainingRecords?: GptIngestMemoryRecord[];
  selectedModelLabel?: string | null;
  platform?: string | null;
  syncTarget?: string[];
}

function limitText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function formatAgent(input: GptIngestMemoryInput) {
  const agent = input.currentAgent;

  return [
    `agentId: ${agent?.agentId || "unknown"}`,
    `expertId: ${agent?.expertId || "none"}`,
    `agentName: ${agent?.agentName || "默认 Agent"}`,
    `category: ${agent?.category || "默认知识库"}`,
    `description: ${agent?.description || "未提供"}`,
    `targetUser: ${agent?.targetUser || "投喂管理员和企业用户"}`
  ].join("\n");
}

function formatMessages(messages: GptIngestMemoryMessage[] = []) {
  const recent = messages.slice(-10);

  if (recent.length === 0) {
    return "暂无同一 Agent 下的最近对话。";
  }

  return recent.map((message, index) => {
    const role = message.role === "user" ? "管理员" : "GPT";
    const model = message.model ? ` · model=${message.model}` : "";
    const provider = message.provider ? ` · provider=${message.provider}` : "";

    return `${index + 1}. ${role}${model}${provider}: ${limitText(message.content, 420)}`;
  }).join("\n");
}

function formatAttachments(input: GptIngestMemoryInput) {
  return buildIngestFileContextPrompt(input.uploadedAttachments, {
    userPrompt: input.currentInput,
    maxFiles: 12,
    maxTotalChars: 18_000
  });
}

function formatDrafts(drafts: Array<Partial<GptKnowledgeDraft>> = []) {
  const compact = drafts.slice(-3).filter((draft) => draft.title || draft.standardQuestion || draft.standardAnswer);

  if (compact.length === 0) {
    return "暂无尚未保存的知识草稿。";
  }

  return compact.map((draft, index) => [
    `${index + 1}. title: ${draft.title || "未命名草稿"}`,
    `category: ${draft.category || "未分类"}`,
    `tags: ${(draft.tags ?? []).join("、") || "无"}`,
    `standardQuestion: ${limitText(draft.standardQuestion, 240) || "未生成"}`,
    `standardAnswer: ${limitText(draft.standardAnswer, 360) || "未生成"}`
  ].join("\n")).join("\n");
}

function formatRecords(records: GptIngestMemoryRecord[] = []) {
  const compact = records.slice(0, 6);

  if (compact.length === 0) {
    return "暂无最近训练记录。";
  }

  return compact.map((record, index) => `${index + 1}. ${record.resultTitle || record.input || "未命名记录"} · ${record.category || "未分类"} · ${record.saveStatus || "未知状态"}`).join("\n");
}

export function buildGptIngestMemoryPrompt(input: GptIngestMemoryInput) {
  return [
    "## 当前 Agent",
    formatAgent(input),
    "",
    "## 最近对话上下文",
    formatMessages(input.recentMessages),
    "",
    "## 当前附件",
    formatAttachments(input),
    "",
    "## 尚未保存的知识草稿",
    formatDrafts(input.previousKnowledgeDrafts),
    "",
    "## 最近训练记录",
    formatRecords(input.recentTrainingRecords),
    "",
    "## 当前运行环境",
    `selectedModelLabel: ${input.selectedModelLabel || "GPT-5.5 超高"}`,
    `platform: ${input.platform || "web"}`,
    `syncTarget: ${(input.syncTarget ?? ["web", "exe", "apk"]).join(" / ")}`
  ].join("\n");
}
