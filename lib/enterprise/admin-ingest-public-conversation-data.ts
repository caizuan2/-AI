export type AdminIngestPublicLinkKind = "share" | "group";

export interface AdminIngestPublicMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AdminIngestPublicGroupMessage {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
}

export interface AdminIngestPublicConversationRecord {
  source: "admin-ingest-public-conversation-v1";
  version: 1;
  token: string;
  kind: AdminIngestPublicLinkKind;
  ownerUserId: string;
  conversationId: string;
  title: string;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  messages: AdminIngestPublicMessage[];
  groupMessages: AdminIngestPublicGroupMessage[];
}

const MAX_PUBLIC_MESSAGES = 200;
const MAX_PUBLIC_MESSAGE_CHARS = 20_000;
const MAX_PUBLIC_TOTAL_CHARS = 120_000;
const MAX_GROUP_MESSAGES = 500;
const MAX_GROUP_MESSAGE_CHARS = 2_000;
const MAX_GROUP_NICKNAME_CHARS = 30;

function cleanText(value: unknown, maxChars: number) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxChars)
    : "";
}

export function sanitizeAdminIngestPublicTitle(value: unknown) {
  return cleanText(value, 80) || "投喂端对话";
}

export function sanitizeAdminIngestPublicMessages(value: unknown): AdminIngestPublicMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const messages: AdminIngestPublicMessage[] = [];
  let totalChars = 0;

  for (const item of value.slice(-MAX_PUBLIC_MESSAGES)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const source = item as Record<string, unknown>;
    const role = source.role === "user" || source.role === "assistant" ? source.role : null;
    const content = cleanText(source.content, MAX_PUBLIC_MESSAGE_CHARS);

    if (!role || !content || totalChars >= MAX_PUBLIC_TOTAL_CHARS) {
      continue;
    }

    const boundedContent = content.slice(0, MAX_PUBLIC_TOTAL_CHARS - totalChars);

    if (!boundedContent) {
      continue;
    }

    messages.push({
      id: cleanText(source.id, 120) || `message-${messages.length + 1}`,
      role,
      content: boundedContent
    });
    totalChars += boundedContent.length;
  }

  return messages;
}

export function sanitizeAdminIngestGroupMessage(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const nickname = cleanText(source.nickname, MAX_GROUP_NICKNAME_CHARS);
  const content = cleanText(source.content, MAX_GROUP_MESSAGE_CHARS);

  if (!nickname) {
    throw new Error("请输入群聊昵称。");
  }

  if (!content) {
    throw new Error("请输入群聊内容。");
  }

  return { nickname, content };
}

export function appendAdminIngestGroupMessage(
  messages: AdminIngestPublicGroupMessage[],
  message: AdminIngestPublicGroupMessage
) {
  return [...messages, message].slice(-MAX_GROUP_MESSAGES);
}
