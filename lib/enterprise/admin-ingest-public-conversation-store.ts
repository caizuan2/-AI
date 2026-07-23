import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import {
  appendAdminIngestGroupMessage,
  sanitizeAdminIngestGroupMessage,
  sanitizeAdminIngestPublicMessages,
  sanitizeAdminIngestPublicTitle,
  type AdminIngestPublicConversationRecord,
  type AdminIngestPublicLinkKind
} from "@/lib/enterprise/admin-ingest-public-conversation-data";

const publicLinkQueues = new Map<string, Promise<void>>();

function safeToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";

  return /^[A-Za-z0-9_-]{24,120}$/.test(token) ? token : "";
}

function safeOwnerId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}

function readPublicConversationDir() {
  return (
    process.env.ADMIN_INGEST_PUBLIC_CONVERSATION_DIR
    || process.env.AI_KB_ADMIN_INGEST_PUBLIC_CONVERSATION_DIR
    || ""
  ).trim();
}

async function getPublicConversationDir() {
  const path = await import("node:path");
  const configured = readPublicConversationDir();

  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  if (process.platform !== "win32" && process.cwd().startsWith("/var/www/ai-knowledge-main-")) {
    return "/var/www/ai-knowledge-shared/admin-ingest/public-conversations";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "public-conversations");
}

async function getRecordPath(token: string) {
  const path = await import("node:path");
  const dir = await getPublicConversationDir();

  return path.join(dir, `${token}.json`);
}

async function readRecord(tokenInput: unknown): Promise<AdminIngestPublicConversationRecord | null> {
  const token = safeToken(tokenInput);

  if (!token) {
    return null;
  }

  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(await getRecordPath(token), "utf8");
    const value = JSON.parse(raw) as AdminIngestPublicConversationRecord;

    if (
      value?.source !== "admin-ingest-public-conversation-v1"
      || value.version !== 1
      || value.token !== token
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

async function writeRecord(record: AdminIngestPublicConversationRecord) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const targetPath = await getRecordPath(record.token);
  const dir = path.dirname(targetPath);
  const temporaryPath = path.join(dir, `.${record.token}-${randomUUID()}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, targetPath);
}

async function withTokenQueue<T>(token: string, task: () => Promise<T>) {
  const previous = publicLinkQueues.get(token) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);

  publicLinkQueues.set(token, queued);
  await previous;

  try {
    return await task();
  } finally {
    release();
    if (publicLinkQueues.get(token) === queued) {
      publicLinkQueues.delete(token);
    }
  }
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

export async function createOrUpdateAdminIngestPublicConversation(input: {
  ownerUserId: string;
  conversationId: string;
  kind: AdminIngestPublicLinkKind;
  title: unknown;
  messages: unknown;
  existingToken?: unknown;
}) {
  const token = safeToken(input.existingToken) || createToken();

  return withTokenQueue(token, async () => {
    const existing = await readRecord(token);

    if (existing && (
      existing.ownerUserId !== safeOwnerId(input.ownerUserId)
      || existing.conversationId !== input.conversationId
      || existing.kind !== input.kind
    )) {
      throw new Error("公开链接不属于当前投喂端对话。");
    }

    const now = new Date().toISOString();
    const record: AdminIngestPublicConversationRecord = {
      source: "admin-ingest-public-conversation-v1",
      version: 1,
      token,
      kind: input.kind,
      ownerUserId: safeOwnerId(input.ownerUserId),
      conversationId: input.conversationId,
      title: sanitizeAdminIngestPublicTitle(input.title),
      status: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages: sanitizeAdminIngestPublicMessages(input.messages),
      groupMessages: existing?.groupMessages ?? []
    };

    await writeRecord(record);
    return record;
  });
}

export async function revokeAdminIngestPublicConversation(input: {
  ownerUserId: string;
  conversationId: string;
  token: unknown;
}) {
  const token = safeToken(input.token);

  if (!token) {
    throw new Error("公开链接无效。");
  }

  return withTokenQueue(token, async () => {
    const existing = await readRecord(token);

    if (
      !existing
      || existing.ownerUserId !== safeOwnerId(input.ownerUserId)
      || existing.conversationId !== input.conversationId
    ) {
      throw new Error("公开链接不存在或不属于当前对话。");
    }

    const record: AdminIngestPublicConversationRecord = {
      ...existing,
      status: "revoked",
      updatedAt: new Date().toISOString()
    };

    await writeRecord(record);
    return record;
  });
}

export async function getActiveAdminIngestPublicConversation(token: unknown) {
  const record = await readRecord(token);

  return record?.status === "active" ? record : null;
}

export async function appendAdminIngestPublicGroupMessage(tokenInput: unknown, input: unknown) {
  const token = safeToken(tokenInput);

  if (!token) {
    throw new Error("群聊链接无效。");
  }

  return withTokenQueue(token, async () => {
    const existing = await readRecord(token);

    if (!existing || existing.status !== "active" || existing.kind !== "group") {
      throw new Error("群聊不存在或已关闭。");
    }

    const message = sanitizeAdminIngestGroupMessage(input);
    const now = new Date().toISOString();
    const record: AdminIngestPublicConversationRecord = {
      ...existing,
      updatedAt: now,
      groupMessages: appendAdminIngestGroupMessage(existing.groupMessages, {
        id: randomUUID(),
        nickname: message.nickname,
        content: message.content,
        createdAt: now
      })
    };

    await writeRecord(record);
    return record;
  });
}
