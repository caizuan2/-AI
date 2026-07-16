import "server-only";

import { randomBytes, randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { getConversationFeatureFlagSnapshot } from "@/lib/conversation-control/feature-flags";
import { buildConversationShareUrl, buildGroupChatInviteUrl } from "@/lib/conversation-control/links";
import { writeAuditLog } from "@/lib/audit-log";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/auth/rbac";
import type {
  ConversationControlAuditAction,
  ConversationFeatureFlags
} from "@/types/conversation-control";

type ConversationActor = Pick<RbacUser, "id" | "role">;
type ConversationFeatureName = keyof ConversationFeatureFlags;
const MAX_PINNED_CONVERSATIONS = 100;

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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createPublicToken() {
  return randomBytes(24).toString("base64url");
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
  requestedAction?: ConversationControlAuditAction;
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
      requestedAction: input.requestedAction ?? null,
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
  const snapshot = await getConversationFeatureFlagSnapshot();
  const flags = snapshot.flags;
  const enabled = flags[feature];

  if (feature === "share") {
    logger.info("[conversation-share] feature flag check", {
      tenantId: null,
      userId: actor.id,
      conversationId,
      shareEnabled: enabled,
      source: snapshot.source,
      sourceAuditLogId: snapshot.sourceAuditLogId,
      sourceCreatedAt: snapshot.sourceCreatedAt
    });
  }

  if (!enabled) {
    await writeConversationAudit({
      actor,
      action: "conversation.action.denied",
      conversationId,
      targetUserId: actor.id,
      request,
      status: "denied",
      requestedAction: action,
      reason: "feature_disabled"
    });

    throw new AppError("FEATURE_DISABLED", "该会话功能暂未开放，请联系超级管理员。", 403);
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

function readRequiredBoolean(input: unknown, key: string) {
  if (!isRecord(input) || typeof input[key] !== "boolean") {
    throw new ValidationError(`${key} 必须是布尔值。`);
  }

  return input[key];
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

export async function setConversationPin(
  actor: ConversationActor,
  conversationId: string,
  input: unknown,
  request?: Request
) {
  const pinned = readRequiredBoolean(input, "pinned");
  const action: ConversationControlAuditAction = pinned ? "pin_conversation" : "unpin_conversation";

  await ensureFeatureEnabled(actor, "pinCloudSync", action, conversationId, request);

  const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";

  if (!normalizedConversationId) {
    throw new ValidationError("conversation_id 不能为空。");
  }

  const { conversation, before, after } = await prisma.$transaction(async (transaction) => {
    // Serialize every pin mutation for the same user so concurrent devices cannot
    // all pass the limit check before any of them writes.
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(734211, hashtext(${actor.id}))
    `;

    const currentConversation = await transaction.conversation.findFirst({
      where: {
        id: normalizedConversationId,
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

    if (!currentConversation || getSoftDeletedAt(currentConversation.metadata)) {
      throw new NotFoundError("会话不存在。");
    }

    const existingPin = await transaction.userConversationPin.findUnique({
      where: {
        userId_conversationId: {
          userId: actor.id,
          conversationId: currentConversation.id
        }
      },
      select: {
        pinnedAt: true
      }
    });
    const beforeSnapshot = {
      conversationId: currentConversation.id,
      pinned: Boolean(existingPin),
      pinnedAt: existingPin?.pinnedAt.toISOString() ?? null
    };

    if (pinned && !existingPin) {
      const pinnedConversationCount = await transaction.userConversationPin.count({
        where: {
          userId: actor.id
        }
      });

      if (pinnedConversationCount >= MAX_PINNED_CONVERSATIONS) {
        throw new ValidationError(`最多可置顶 ${MAX_PINNED_CONVERSATIONS} 个会话，请先取消部分置顶。`);
      }
    }

    const pin = pinned
      ? await transaction.userConversationPin.upsert({
          where: {
            userId_conversationId: {
              userId: actor.id,
              conversationId: currentConversation.id
            }
          },
          create: {
            userId: actor.id,
            conversationId: currentConversation.id
          },
          update: {},
          select: {
            pinnedAt: true
          }
        })
      : null;

    if (!pinned) {
      await transaction.userConversationPin.deleteMany({
        where: {
          userId: actor.id,
          conversationId: currentConversation.id
        }
      });
    }

    return {
      conversation: currentConversation,
      before: beforeSnapshot,
      after: {
        conversationId: currentConversation.id,
        pinned,
        pinnedAt: pin?.pinnedAt.toISOString() ?? null
      }
    };
  });

  await writeConversationAudit({
    actor,
    action,
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversation_id: conversation.id,
    pinned,
    pinned_at: after.pinnedAt
  };
}

export async function softDeleteConversation(
  actor: ConversationActor,
  conversationId: string,
  input: unknown,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "delete", "delete_conversation", conversationId, request);

  const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";

  if (!normalizedConversationId) {
    throw new ValidationError("conversation_id 不能为空。");
  }

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(734211, hashtext(${actor.id}))
    `;

    const conversation = await transaction.conversation.findFirst({
      where: {
        id: normalizedConversationId,
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

    const existingPin = await transaction.userConversationPin.findUnique({
      where: {
        userId_conversationId: {
          userId: actor.id,
          conversationId: conversation.id
        }
      },
      select: {
        pinnedAt: true
      }
    });
    const metadata = buildMetadata(conversation.metadata, {
      deletedAt: new Date().toISOString(),
      deletedByUserId: actor.id,
      deleteReason: readReason(input),
      deleteMode: "soft_delete",
      attachmentPolicy: "keep_attachments"
    });
    const updated = await transaction.conversation.update({
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

    await transaction.userConversationPin.deleteMany({
      where: {
        userId: actor.id,
        conversationId: conversation.id
      }
    });

    const beforeConversation = buildConversationSnapshot(conversation);
    const afterConversation = buildConversationSnapshot(updated);

    return {
      conversation,
      before: {
        ...beforeConversation,
        pinned: Boolean(existingPin),
        pinnedAt: existingPin?.pinnedAt.toISOString() ?? null
      },
      after: {
        ...afterConversation,
        pinned: false,
        pinnedAt: null
      },
      afterConversation
    };
  });

  await writeConversationAudit({
    actor,
    action: "delete_conversation",
    conversationId: result.conversation.id,
    targetUserId: result.conversation.userId,
    request,
    status: "allowed",
    before: result.before,
    after: result.after
  });

  return {
    deleted: true,
    deleteMode: "soft_delete",
    attachmentPolicy: "keep_attachments",
    conversation: result.afterConversation
  };
}

export async function shareConversation(
  actor: ConversationActor,
  conversationId: string,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "share", "share_conversation", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  logger.info("[conversation-share] conversation owner check ok", {
    userId: actor.id,
    conversationId: conversation.id
  });
  const before = buildConversationSnapshot(conversation);
  const existingShare = isRecord(before.conversationControl.share) ? before.conversationControl.share : {};
  const shareId = readString(existingShare.id) ?? randomUUID();
  const shareToken = readString(existingShare.token) ?? createPublicToken();
  const shareUrl = buildConversationShareUrl(request, shareToken);
  const metadata = buildMetadata(conversation.metadata, {
    share: {
      id: shareId,
      token: shareToken,
      enabled: true,
      status: "active",
      shareUrl,
      createdAt: readString(existingShare.createdAt) ?? new Date().toISOString(),
      createdByUserId: readString(existingShare.createdByUserId) ?? actor.id,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actor.id
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
    action: "conversation.share.created",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversationId: conversation.id,
    shareId,
    shareUrl,
    link: shareUrl,
    url: shareUrl,
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
  const existingGroupChat = isRecord(before.conversationControl.groupChat) ? before.conversationControl.groupChat : {};
  const groupChatId = readString(existingGroupChat.id) ?? randomUUID();
  const inviteToken = readString(existingGroupChat.inviteToken) ?? createPublicToken();
  const inviteUrl = buildGroupChatInviteUrl(request, inviteToken);
  const metadata = buildMetadata(conversation.metadata, {
    groupChat: {
      id: groupChatId,
      inviteToken,
      inviteUrl,
      status: "created",
      createdAt: readString(existingGroupChat.createdAt) ?? new Date().toISOString(),
      createdByUserId: readString(existingGroupChat.createdByUserId) ?? actor.id,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actor.id,
      inviteDeletedAt: null,
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
    action: "conversation.group_chat.created",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversationId: conversation.id,
    groupChatId,
    inviteUrl,
    link: inviteUrl,
    url: inviteUrl,
    joinUrl: inviteUrl,
    status: "created",
    conversation: after
  };
}

export async function resetGroupChatInviteLink(
  actor: ConversationActor,
  conversationId: string,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "groupChat", "create_group_chat", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const existingGroupChat = isRecord(before.conversationControl.groupChat) ? before.conversationControl.groupChat : {};
  const groupChatId = readString(existingGroupChat.id) ?? randomUUID();
  const inviteToken = createPublicToken();
  const inviteUrl = buildGroupChatInviteUrl(request, inviteToken);
  const metadata = buildMetadata(conversation.metadata, {
    groupChat: {
      ...existingGroupChat,
      id: groupChatId,
      inviteToken,
      inviteUrl,
      status: "created",
      createdAt: readString(existingGroupChat.createdAt) ?? new Date().toISOString(),
      createdByUserId: readString(existingGroupChat.createdByUserId) ?? actor.id,
      inviteResetAt: new Date().toISOString(),
      inviteResetByUserId: actor.id,
      inviteDeletedAt: null,
      memberPolicy: readString(existingGroupChat.memberPolicy) ?? "owner_only_until_group_schema"
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
    action: "conversation.group_chat.link_reset",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversationId: conversation.id,
    groupChatId,
    inviteUrl,
    link: inviteUrl,
    url: inviteUrl,
    joinUrl: inviteUrl,
    conversation: after
  };
}

export async function deleteGroupChatInviteLink(
  actor: ConversationActor,
  conversationId: string,
  request?: Request
) {
  await ensureFeatureEnabled(actor, "groupChat", "create_group_chat", conversationId, request);

  const conversation = await getOwnedConversation(actor, conversationId);
  const before = buildConversationSnapshot(conversation);
  const existingGroupChat = isRecord(before.conversationControl.groupChat) ? before.conversationControl.groupChat : {};
  const groupChatId = readString(existingGroupChat.id) ?? randomUUID();
  const metadata = buildMetadata(conversation.metadata, {
    groupChat: {
      ...existingGroupChat,
      id: groupChatId,
      inviteToken: null,
      inviteUrl: null,
      inviteDeletedAt: new Date().toISOString(),
      inviteDeletedByUserId: actor.id,
      status: "link_deleted"
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
    action: "conversation.group_chat.link_deleted",
    conversationId: conversation.id,
    targetUserId: conversation.userId,
    request,
    status: "allowed",
    before,
    after
  });

  return {
    conversationId: conversation.id,
    groupChatId,
    message: "群聊链接已删除。",
    conversation: after
  };
}

export function isConversationSoftDeleted(metadata: unknown) {
  return Boolean(getSoftDeletedAt(metadata));
}
