import type { RagContext } from "@/lib/ai/rag-prompt";
import { cleanUserFacingRagAnswer } from "@/lib/ai/rag-output";
import {
  buildCustomerAnswerFromChunks,
  buildCustomerAnswerFromText,
  buildNoKnowledgeCustomerAnswer
} from "@/lib/ai-chat/customer-answer";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/rbac/roles";
import {
  buildRagContext,
  calculateConfidence,
  getTopKForMode,
  hasPromptInjectionRisk,
  normalizeAiChatMode,
  retrieveRelevantChunks,
  sanitizeRagInput,
  type AiChatMode,
  type RagConfidence,
  type RagSearchDb,
  type RetrievedRagChunk
} from "@/lib/rag/search";

export const NO_KNOWLEDGE_ANSWER = "知识库中暂无明确资料。";
export const RAG_CUSTOMER_DRAFT_ANSWER = "已根据知识库资料整理如下，可直接复制给客户。";

export interface AiChatActor {
  id: string;
  role: AppRole;
}

export interface AiChatAskInput {
  question?: unknown;
  mode?: unknown;
  enable_deep_thinking?: unknown;
  enable_web_search?: unknown;
  conversation_id?: unknown;
  conversationId?: unknown;
  attachments?: unknown;
}

export interface AiChatAnswerProviderInput {
  question: string;
  contexts: RagContext[];
  mode: AiChatMode;
  enableDeepThinking: boolean;
  confidence: RagConfidence;
}

export interface AiChatAnswerProviderResult {
  answer: string;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
}

export interface AiChatAskOptions {
  db?: AiChatDb;
  answerProvider?: (input: AiChatAnswerProviderInput) => Promise<AiChatAnswerProviderResult>;
  providerConfigured?: boolean;
}

type JsonObject = Record<string, unknown>;

type ConversationRecord = Record<string, unknown> & {
  id?: string;
  userId?: string;
  title?: string;
  type?: string;
  mode?: string;
  metadata?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  messages?: MessageRecord[];
  _count?: {
    messages?: number;
  };
};

type MessageRecord = Record<string, unknown> & {
  id?: string;
  conversationId?: string;
  userId?: string | null;
  role?: string;
  content?: string;
  attachments?: unknown;
  sources?: unknown;
  metadata?: unknown;
  createdAt?: Date | string;
};

export type AiChatDb = RagSearchDb & {
  conversation: {
    findFirst(args: unknown): Promise<ConversationRecord | null>;
    findMany(args: unknown): Promise<ConversationRecord[]>;
    create(args: unknown): Promise<ConversationRecord>;
    update(args: unknown): Promise<ConversationRecord>;
  };
  message: {
    create(args: unknown): Promise<MessageRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_METADATA_BYTES = 4096;
const allowedAttachmentTypes = new Set(["image", "camera_photo", "gallery_photo", "file", "audio", "video"]);

function defaultDb() {
  return prisma as unknown as AiChatDb;
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value ? new Date(value).toISOString() : "";
}

function toJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function getJsonByteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function inferConversationTitle(question: string) {
  return question.length > 40 ? `${question.slice(0, 40)}...` : question;
}

function readConversationId(input: AiChatAskInput) {
  const conversationId = trimString(input.conversation_id) || trimString(input.conversationId);

  return conversationId || null;
}

function validateAttachments(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError("attachments 必须是数组。");
  }

  if (value.length > MAX_ATTACHMENTS) {
    throw new ValidationError(`attachments 数量不能超过 ${MAX_ATTACHMENTS} 个。`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError(`第 ${index + 1} 个 attachment 必须是对象。`);
    }

    const record = item as Record<string, unknown>;
    const type = trimString(record.type);

    if (!allowedAttachmentTypes.has(type)) {
      throw new ValidationError("attachment 类型不被支持。");
    }

    if ("content" in record || "base64" in record || "bytes" in record || "storagePath" in record || "storage_path" in record) {
      throw new ValidationError("本轮仅支持 attachment 元数据预留，不支持直接上传或解析附件内容。");
    }

    const metadata = toJsonObject(record.metadata);

    if (metadata && getJsonByteLength(metadata) > MAX_ATTACHMENT_METADATA_BYTES) {
      throw new ValidationError(`第 ${index + 1} 个 attachment metadata 过大。`);
    }

    return {
      type,
      name: trimString(record.name) || null,
      mime_type: trimString(record.mime_type) || trimString(record.mimeType) || null,
      size: typeof record.size === "number" && Number.isFinite(record.size) ? Math.max(0, Math.round(record.size)) : null,
      reference_id: trimString(record.reference_id) || trimString(record.referenceId) || null,
      metadata: metadata ?? null
    };
  });
}

function toSource(chunk: RetrievedRagChunk) {
  return {
    chunk_id: chunk.chunkId,
    file_id: chunk.fileId,
    title: chunk.title,
    score: chunk.score
  };
}

async function writeAuditLog(
  db: AiChatDb,
  actor: AiChatActor,
  action: "CHAT_ASK" | "CHAT_RETRIEVE" | "CHAT_PROVIDER_NOT_CONFIGURED" | "CHAT_BLOCKED_UNSAFE_INPUT",
  targetId: string | null,
  metadata: JsonObject
) {
  await db.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action,
      targetType: "ai_chat",
      targetId,
      metadata
    }
  }).catch(() => undefined);
}

async function getOrCreateConversation(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string | null,
  question: string,
  mode: AiChatMode
) {
  if (conversationId) {
    const existing = await db.conversation.findFirst({
      where: {
        id: conversationId,
        userId: actor.id,
        type: "CHAT"
      }
    });

    if (!existing) {
      throw new NotFoundError("会话不存在。");
    }

    return existing;
  }

  return db.conversation.create({
    data: {
      userId: actor.id,
      title: inferConversationTitle(question),
      type: "CHAT",
      mode,
      metadata: {
        createdBy: "api_ai_chat_ask"
      }
    }
  });
}

async function saveUserMessage(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string,
  question: string,
  attachments: ReturnType<typeof validateAttachments>,
  metadata: JsonObject
) {
  return db.message.create({
    data: {
      conversationId,
      userId: actor.id,
      role: "USER",
      content: question,
      attachments,
      metadata
    }
  });
}

async function saveAssistantMessage(
  db: AiChatDb,
  actor: AiChatActor,
  conversationId: string,
  answer: string,
  sources: ReturnType<typeof toSource>[],
  customerAnswer: string,
  metadata: JsonObject
) {
  return db.message.create({
    data: {
      conversationId,
      userId: actor.id,
      role: "ASSISTANT",
      content: answer,
      sources,
      metadata: {
        ...metadata,
        customerAnswer
      }
    }
  });
}

export async function handleAiChatAsk(
  actor: AiChatActor,
  input: AiChatAskInput,
  options: AiChatAskOptions = {}
) {
  const db = options.db ?? defaultDb();
  const question = sanitizeRagInput(input.question);
  const mode = normalizeAiChatMode(input.mode);
  const enableDeepThinking = input.enable_deep_thinking === true;
  const enableWebSearch = input.enable_web_search === true;
  const conversationId = readConversationId(input);
  const attachments = validateAttachments(input.attachments);

  if (hasPromptInjectionRisk(question)) {
    await writeAuditLog(db, actor, "CHAT_BLOCKED_UNSAFE_INPUT", null, {
      mode,
      questionLength: question.length
    });
    throw new ValidationError("问题包含不安全指令，无法处理。");
  }

  const conversation = await getOrCreateConversation(db, actor, conversationId, question, mode);
  const normalizedConversationId = String(conversation.id);
  await saveUserMessage(db, actor, normalizedConversationId, question, attachments, {
    mode,
    enableDeepThinking,
    enableWebSearch,
    attachmentCount: attachments.length
  });
  await writeAuditLog(db, actor, "CHAT_ASK", normalizedConversationId, {
    mode,
    questionLength: question.length,
    enableDeepThinking,
    enableWebSearch,
    attachmentCount: attachments.length
  });

  const topK = getTopKForMode(mode);
  const chunks = await retrieveRelevantChunks(question, {
    userId: actor.id,
    mode,
    topK,
    db
  });
  const contexts = buildRagContext(chunks);
  const sources = chunks.map(toSource);
  const confidence = calculateConfidence(chunks);
  await writeAuditLog(db, actor, "CHAT_RETRIEVE", normalizedConversationId, {
    mode,
    topK,
    sourceCount: sources.length,
    confidence
  });

  let answer = NO_KNOWLEDGE_ANSWER;
  let customerAnswer = buildNoKnowledgeCustomerAnswer();
  let providerStatus: "ok" | "provider_not_configured" | "no_relevant_knowledge" | "error" = "no_relevant_knowledge";
  let providerUsed: string | undefined;
  let modelUsed: string | undefined;
  let fallbackUsed: boolean | undefined;

  if (contexts.length > 0) {
    customerAnswer = buildCustomerAnswerFromChunks({
      question,
      chunks,
      confidence,
      mode
    });

    if (options.providerConfigured && options.answerProvider) {
      try {
        const providerResult = await options.answerProvider({
          question,
          contexts,
          mode,
          enableDeepThinking,
          confidence
        });

        answer = cleanUserFacingRagAnswer(providerResult.answer);
        customerAnswer = buildCustomerAnswerFromText(question, answer);
        providerStatus = "ok";
        providerUsed = providerResult.providerUsed;
        modelUsed = providerResult.modelUsed;
        fallbackUsed = providerResult.fallbackUsed;

        if (!answer) {
          throw new AppError("AI_PROVIDER_FAILED", "AI provider 返回了空回答。", 502);
        }
      } catch {
        answer = RAG_CUSTOMER_DRAFT_ANSWER;
        providerStatus = "provider_not_configured";
      }
    } else {
      answer = RAG_CUSTOMER_DRAFT_ANSWER;
      providerStatus = "provider_not_configured";
      await writeAuditLog(db, actor, "CHAT_PROVIDER_NOT_CONFIGURED", normalizedConversationId, {
        mode,
        sourceCount: sources.length
      });
    }
  }

  const assistantMessage = await saveAssistantMessage(db, actor, normalizedConversationId, answer, sources, customerAnswer, {
    mode,
    confidence,
    sourceCount: sources.length,
    enableDeepThinking,
    enableWebSearch,
    webSearchStatus: enableWebSearch ? "reserved_not_enabled" : "disabled",
    providerStatus,
    providerUsed: providerUsed ?? null,
    modelUsed: modelUsed ?? null,
    fallbackUsed: fallbackUsed ?? null
  });
  await db.conversation.update({
    where: {
      id: normalizedConversationId
    },
    data: {
      mode,
      metadata: {
        lastMode: mode,
        lastConfidence: confidence,
        lastSourceCount: sources.length,
        enableDeepThinking,
        enableWebSearch
      }
    }
  }).catch(() => undefined);

  return {
    answer,
    conversation_id: normalizedConversationId,
    message_id: String(assistantMessage.id),
    mode,
    customer_answer: customerAnswer,
    sources,
    confidence,
    provider_status: providerStatus
  };
}

function serializeConversation(conversation: ConversationRecord) {
  return {
    id: String(conversation.id),
    title: String(conversation.title ?? "新会话"),
    mode: normalizeAiChatMode(conversation.mode),
    metadata: conversation.metadata ?? null,
    message_count: Number(conversation._count?.messages ?? 0),
    created_at: toIsoString(conversation.createdAt),
    updated_at: toIsoString(conversation.updatedAt)
  };
}

function serializeMessage(message: MessageRecord) {
  const role = String(message.role ?? "").toLowerCase();
  const metadata = toJsonObject(message.metadata) ?? {};
  const confidence = typeof metadata.confidence === "string" ? metadata.confidence : null;
  const providerStatus = typeof metadata.providerStatus === "string" ? metadata.providerStatus : null;
  const customerAnswer = typeof metadata.customerAnswer === "string" ? metadata.customerAnswer : null;

  return {
    id: String(message.id),
    role: role || "user",
    content: String(message.content ?? ""),
    attachments: message.attachments ?? null,
    sources: message.sources ?? null,
    customer_answer: customerAnswer,
    provider_status: providerStatus,
    confidence,
    metadata: message.metadata ?? null,
    created_at: toIsoString(message.createdAt)
  };
}

export async function listAiChatConversations(actor: AiChatActor, db: AiChatDb = defaultDb()) {
  const conversations = await db.conversation.findMany({
    where: {
      userId: actor.id,
      type: "CHAT"
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 50,
    include: {
      _count: {
        select: {
          messages: true
        }
      }
    }
  });

  return {
    conversations: conversations.map(serializeConversation)
  };
}

export async function getAiChatHistory(actor: AiChatActor, conversationId: string, db: AiChatDb = defaultDb()) {
  const normalizedConversationId = trimString(conversationId);

  if (!normalizedConversationId) {
    throw new ValidationError("conversation_id 不能为空。");
  }

  const conversation = await db.conversation.findFirst({
    where: {
      id: normalizedConversationId,
      userId: actor.id,
      type: "CHAT"
    },
    include: {
      messages: {
        where: {
          OR: [
            { userId: actor.id },
            { userId: null }
          ]
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!conversation) {
    throw new NotFoundError("会话不存在。");
  }

  return {
    conversation: serializeConversation(conversation),
    messages: (conversation.messages ?? []).map(serializeMessage)
  };
}
