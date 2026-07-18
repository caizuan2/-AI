import "server-only";

import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  IntegrationListData,
  IntegrationProvider,
  MarkNotificationsReadResult,
  NotificationChannel,
  NotificationListData,
  NotificationReadStatus,
  NotificationScope,
  NotificationType,
  SaveIntegrationConfigRequest
} from "@/apps/team-os/features/notification/types";
import { NOTIFICATION_CHANNELS } from "@/apps/team-os/features/notification/types";
import {
  assertCanManageIntegrations,
  resolveNotificationAccess
} from "@/apps/team-os/features/notification/services/notification-access";
import { notificationRepositories } from "@/apps/team-os/features/notification/services/notification-repositories";
import { notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
import {
  decryptIntegrationConfig,
  encryptIntegrationConfig
} from "@/apps/team-os/features/notification/utils/integration-config-crypto";
import {
  normalizeIdentifier,
  normalizeIntegrationProvider,
  normalizeProviderIntegrationConfig
} from "@/apps/team-os/features/notification/utils/notification-input";

export async function listNotificationsForViewer(input: {
  userId: string;
  companyId?: string;
  scope?: NotificationScope;
  type?: NotificationType;
  readStatus?: NotificationReadStatus;
  page?: number;
  pageSize?: number;
}): Promise<NotificationListData> {
  const scope = input.scope ?? "MINE";
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope
  });
  const query = {
    companyId: access.companyId,
    teamIds: access.visibleTeamIds ?? undefined,
    userIds: access.visibleUserIds,
    type: input.type,
    readStatus: input.readStatus,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20
  };
  const [{ items, total }, unreadCount] = await Promise.all([
    notificationRepositories.notifications.list(query),
    notificationRepositories.notifications.countUnread({
      companyId: access.companyId,
      teamIds: access.visibleTeamIds ?? undefined,
      userIds: access.visibleUserIds
    })
  ]);
  let visibleItems = items;
  if (scope === "TEAM" && items.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: Array.from(new Set(items.map((item) => item.userId))) },
        isActive: true
      },
      select: { id: true, name: true }
    });
    const nameByUserId = new Map(users.map((user) => [user.id, user.name]));
    visibleItems = items.map((item) => ({
      ...item,
      recipientName: nameByUserId.get(item.userId) ?? null
    }));
  }
  return {
    companyId: access.companyId,
    companies: access.companies,
    scope,
    canViewTeamNotifications: access.canViewTeamNotifications,
    items: visibleItems,
    unreadCount,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    }
  };
}

export async function markNotificationsAsReadForViewer(input: {
  userId: string;
  companyId: string;
  notificationIds?: string[];
  all?: boolean;
}): Promise<MarkNotificationsReadResult> {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope: "MINE"
  });
  const updatedCount = await notificationRepositories.notifications.markAsRead({
    companyId: access.companyId,
    userId: input.userId,
    notificationIds: input.notificationIds,
    all: input.all
  });
  const unreadCount = await notificationRepositories.notifications.countUnread({
    companyId: access.companyId,
    userIds: [input.userId]
  });
  return { updatedCount, unreadCount };
}

function withDefaultPreferences(
  userId: string,
  stored: Awaited<ReturnType<typeof notificationRepositories.preferences.list>>
) {
  const byChannel = new Map(stored.map((preference) => [preference.channel, preference]));
  return NOTIFICATION_CHANNELS.map((channel) => byChannel.get(channel) ?? {
    id: null,
    userId,
    channel,
    enabled: channel === "IN_APP",
    createdAt: null
  });
}

export async function getNotificationPreferencesForViewer(input: { userId: string; companyId?: string }) {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope: "MINE"
  });
  const stored = await notificationRepositories.preferences.list(input.userId);
  return {
    companyId: access.companyId,
    companies: access.companies,
    preferences: withDefaultPreferences(input.userId, stored)
  };
}

export async function saveNotificationPreferencesForViewer(input: {
  userId: string;
  companyId: string;
  preferences: Array<{ channel: NotificationChannel; enabled: boolean }>;
}) {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope: "MINE"
  });
  await notificationRepositories.preferences.upsertMany(input.preferences.map((preference) => ({
    userId: input.userId,
    channel: preference.channel,
    enabled: preference.enabled
  })));
  const stored = await notificationRepositories.preferences.list(input.userId);
  return {
    companyId: access.companyId,
    companies: access.companies,
    preferences: withDefaultPreferences(input.userId, stored)
  };
}

export async function getIntegrationsForViewer(input: { userId: string; companyId?: string }): Promise<IntegrationListData> {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope: "MINE",
    ownerCompaniesOnly: true
  });
  assertCanManageIntegrations(access);
  return {
    companyId: access.companyId,
    companies: access.companies,
    integrations: await notificationRepositories.integrations.listByCompany(access.companyId),
    canManage: access.canManageIntegrations
  };
}

export async function saveIntegrationForViewer(input: {
  userId: string;
  request: SaveIntegrationConfigRequest;
}): Promise<IntegrationListData> {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.request.companyId,
    scope: "MINE",
    ownerCompaniesOnly: true
  });
  assertCanManageIntegrations(access);
  if (typeof input.request.enabled !== "boolean") {
    throw new ValidationError("连接启用状态格式不正确。");
  }
  const provider = normalizeIntegrationProvider(input.request.provider);
  const configEntries = input.request.config ? Object.keys(input.request.config) : [];
  const context = { companyId: access.companyId, provider };
  let encryptedConfig: string | undefined;
  if (configEntries.length > 0) {
    const partialConfig = normalizeProviderIntegrationConfig(provider, input.request.config, { partial: true });
    const existing = await notificationRepositories.integrations.findStored(access.companyId, provider);
    const existingConfig = existing
      ? decryptIntegrationConfig(existing.encryptedConfig, context)
      : {};
    const completeConfig = normalizeProviderIntegrationConfig(provider, {
      ...existingConfig,
      ...partialConfig
    });
    encryptedConfig = encryptIntegrationConfig(completeConfig, context);
  }
  await notificationRepositories.integrations.save({
    companyId: access.companyId,
    provider,
    enabled: input.request.enabled === true,
    encryptedConfig
  });
  return getIntegrationsForViewer({ userId: input.userId, companyId: access.companyId });
}

export async function testIntegrationForViewer(input: {
  userId: string;
  companyId: string;
  provider: IntegrationProvider;
}) {
  const access = await resolveNotificationAccess({
    userId: input.userId,
    requestedCompanyId: input.companyId,
    scope: "MINE",
    ownerCompaniesOnly: true
  });
  assertCanManageIntegrations(access);
  return notificationGateway.testProvider({
    companyId: access.companyId,
    userId: normalizeIdentifier(input.userId, "用户 ID"),
    provider: normalizeIntegrationProvider(input.provider)
  });
}
