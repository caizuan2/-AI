import "server-only";

import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";

function normalizeToken(value: string) {
  const token = value.trim();

  if (!token || token.length < 16) {
    throw new ValidationError("链接令牌无效。");
  }

  return token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readControl(metadata: unknown) {
  if (!isRecord(metadata)) {
    return {};
  }

  return isRecord(metadata.conversationControl) ? metadata.conversationControl : {};
}

function readNestedRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : {};
}

export async function getConversationShareByToken(rawToken: string) {
  const token = normalizeToken(rawToken);
  const conversation = await prisma.conversation.findFirst({
    where: {
      type: "CHAT",
      metadata: {
        path: ["conversationControl", "share", "token"],
        equals: token
      }
    },
    select: {
      id: true,
      title: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const control = readControl(conversation?.metadata);
  const share = readNestedRecord(control, "share");

  if (!conversation || control.deletedAt || share.enabled !== true) {
    throw new NotFoundError("分享链接不存在或已失效。");
  }

  return {
    conversationId: conversation.id,
    title: conversation.title,
    status: "active",
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}

export async function getGroupChatInviteByToken(rawToken: string) {
  const token = normalizeToken(rawToken);
  const conversation = await prisma.conversation.findFirst({
    where: {
      type: "CHAT",
      metadata: {
        path: ["conversationControl", "groupChat", "inviteToken"],
        equals: token
      }
    },
    select: {
      id: true,
      title: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const control = readControl(conversation?.metadata);
  const groupChat = readNestedRecord(control, "groupChat");

  if (!conversation || control.deletedAt || groupChat.inviteDeletedAt) {
    throw new NotFoundError("群聊邀请链接不存在或已失效。");
  }

  return {
    conversationId: conversation.id,
    groupChatId: typeof groupChat.id === "string" ? groupChat.id : null,
    title: conversation.title,
    status: "active",
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}
