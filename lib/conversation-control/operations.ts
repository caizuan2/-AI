import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { getConversationFeatureFlags } from "@/lib/conversation-control/feature-flags";
import { writeAuditLog } from "@/lib/audit-log";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/auth/rbac";
import type {
  ConversationControlAuditAction,
  ConversationFeatureFlags
} from "@/types/conversation-control";

type ConversationActor = Pick<RbacUser, "id" | "role">;
type ConversationFeatureName = keyof ConversationFeatureFlags;

type ConversationRecord = {
  id: string;
  userId: string;
  title: string;
  metadata: Prisma.JsonValue | null;
  updatedAt: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : {};
}

function getConversationControl(metadata: unknown) {
  const root = toMetadataRecord(metadata);
  const control = isRecord(root.conversationControl) ? root.conversationControl : {};

  return {
    root,
    control: JSON.parse(JSON.stringify(control)) as Record<string, unknown>
  };
}

function getSoftDeletedAt(metadata: unknown) {
  const { control } = getConversationControl(metadata);
  return typeof control.deletedAt === "string" && control.deletedAt ? control.deletedAt : null;
}

function buildMetadata(metadata: unknown, controlPatch: Record<string, unknown>) {
  const { root, control } = getConversationControl(metadata);

  return {
    ...root,
    conversationControl: {
      ...control,
      ...controlPatch
    }
  } as Prisma.InputJsonObject;
}

async function writeConversationAudit(input: {
  actor: ConversationActor;
  action: ConversationControlAuditAction;
  conversationId: string | null;
  targetUserId: string | null;
  request?: Request;
  status: "allowed" | "denied";
  reason?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  await writeAuditLog({
    userId: input.actor.id,
    role: input.actor.role,
    action: input.action,
    targetType: "conversation",
    targetId: input.conversationId,
    request: input.request,
    metadata: {
      operatorUserId: input.actor.id,
      targetUserId: input.targetUserId,
      action: input.action,
      resourceType: "conversation",
      resourceId: input.conversationId,
      before: input.before ?? null,
      after: input.after ?? null,
      status: input.status,
      reason: input.reason ?? null
    } as Prisma.InputJsonObject
  });
}

async function ensureFeatureEnabled(
  actor: ConversationActor,
  feature: ConversationFeatureName,
  action: ConversationControlAuditAction,
  conversationId: string,
  request?: Request
) {
  const flags = await getConversationFeatureFlags();

  if (!flags[feature]) {
    await writeConversationAudit({
      actor,
      action,
      conversationId,
      targetUserId: actor.id,
      request,
      status: "denied",
      reason: "feature_disabled"
    });

    throw new ForbiddenError("该会话功能暂未开放，请联系超级管理员。");
  }
}

async function getOwnedConversation(actor: ConversationActor, conversationId: string) {
  const normalizedId = typeof conversationId === "string" ? conversationId.trim() : "";

  if (!normalizedId) {
    throw new ValidationError("conversation_id 不能为空。");
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: normalizedId,
      userId: actor.id,
      type: "CHAT"
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });

  if (!conversation || getSoftDeletedAt(conversation.metadata)) {
    throw new NotFoundError("会话不存在。");
  }

  return conversation;
}

function buildConversationSnapshot(conversation: ConversationRecord) {
  const { control } = getConversationControl(conversation.metadata);

  return {
    id: conversation.id,
    title: conversation.title,
    userId: conversation.userId,
    conversationControl: control,
    updatedAt: conversation.updatedAt.toISOString()
  };
}

function readTitle(input: unknown) {
  if (!isRecord(input)) {
    return "";
  }

  return typeof input.title === "string" ? input.title.trim() : "";
}

function readBoolean(input: unknown, key: string, fallback: boolean) {
  if (!isRecord(input)) {
    return fallback;
  }

  return typeof input[key] === "boolean" ? input[key] : fallback;
}

function readReason(input: unknown) {
  if (!isRecord(input)) {
    return null;
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  return reason || null;
}

export async function renameConversation(
  actor: ConversationActor,
  conversationId: string,
  input: unknown,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "rename", "rename_conversation", conversationId, request);

  const title = readTitle(input);

  if (!title) {
    throw new ValidationError("会话标题不能为空。");
  }

  if (title.length > 80) {
    throw new ValidationError("会话标题不能超过 80 个字符。");
  }

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const metadata = buildMetadata(conversation.metadata, {
    lastRenamedAt: new Date().toISOString(),
    lastRenamedByUserId: actor.id
  });
  const updated = await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      title,
      metadata
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });
  const after = buildConversationSnapshot(updated);

  await writeConversationAudit({
    actor,
    action: "rename_conversation",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversation: after
  };
}

export async function archiveConversation(
  actor: ConversationActor,
  conversationId: string,
  input: unknown,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "archive", "archive_conversation", conversationId, request);

  const archived = readBoolean(input, "archived", true);
  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const metadata = buildMetadata(conversation.metadata, {
    archivedAt: archived ? new Date().toISOString() : null,
    archivedByUserId: archived ? actor.id : null
  });
  const updated = await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      metadata
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });
  const after = buildConversationSnapshot(updated);

  await writeConversationAudit({
    actor,
    action: "archive_conversation",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    archived,
    conversation: after
  };
}

export async function softDeleteConversation(
  actor: ConversationActor,
  conversationId: string,
  input: unknown,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "delete", "delete_conversation", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const metadata = buildMetadata(conversation.metadata, {
    deletedAt: new Date().toISOString(),
    deletedByUserId: actor.id,
    deleteReason: readReason(input),
    deleteMode: "soft_delete",
    attachmentPolicy: "keep_attachments"
  });
  const updated = await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      metadata
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });
  const after = buildConversationSnapshot(updated);

  await writeConversationAudit({
    actor,
    action: "delete_conversation",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    deleted: true,
    deleteMode: "soft_delete",
    attachmentPolicy: "keep_attachments",
    conversation: after
  };
}

export async function shareConversation(
  actor: ConversationActor,
  conversationId: string,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "share", "share_conversation", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const shareId = randomUUID();
  const metadata = buildMetadata(conversation.metadata, {
    share: {
      id: shareId,
      enabled: true,
      status: "policy_ready",
      createdAt: new Date().toISOString(),
      createdByUserId: actor.id
    }
  });
  const updated = await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      metadata
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });
  const after = buildConversationSnapshot(updated);

  await writeConversationAudit({
    actor,
    action: "share_conversation",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    shareId,
    shareEnabled: true,
    conversation: after
  };
}

export async function createGroupChatFromConversation(
  actor: ConversationActor,
  conversationId: string,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "groupChat", "create_group_chat", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const groupChatId = randomUUID();
  const metadata = buildMetadata(conversation.metadata, {
    groupChat: {
      id: groupChatId,
      status: "created",
      createdAt: new Date().toISOString(),
      createdByUserId: actor.id,
      memberPolicy: "owner_only_until_group_schema"
    }
  });
  const updated = await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      metadata
    },
    select: {
      id: true,
      userId: true,
      title: true,
      metadata: true,
      updatedAt: true
    }
  });
  const after = buildConversationSnapshot(updated);

  await writeConversationAudit({
    actor,
    action: "create_group_chat",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    groupChatId,
    status: "created",
    conversation: after
  };
}

export function isConversationSoftDeleted(metadata: unknown) {
  return Boolean(getSoftDeletedAt(metadata));
}
