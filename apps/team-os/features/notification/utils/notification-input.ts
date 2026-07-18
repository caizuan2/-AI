import { ValidationError } from "@/lib/errors";
import {
  INTEGRATION_PROVIDERS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_READ_STATUSES,
  NOTIFICATION_SCOPES,
  NOTIFICATION_TYPES,
  type CreateNotificationInput,
  type IntegrationProvider,
  type MarkNotificationsReadInput,
  type NotificationChannel,
  type NotificationListQuery,
  type NotificationReadStatus,
  type NotificationScope,
  type NotificationType,
  type UpdateNotificationPreferenceInput
} from "@/apps/team-os/features/notification/types";

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new ValidationError(`${label}格式不正确。`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) throw new ValidationError(`${label}不能为空。`);
  if (normalized.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  return normalized;
}

export function normalizeIdentifier(value: unknown, label: string) {
  return requiredText(value, label, 191);
}

export function normalizeNotificationType(value: unknown): NotificationType {
  if (typeof value === "string" && NOTIFICATION_TYPES.includes(value as NotificationType)) {
    return value as NotificationType;
  }
  throw new ValidationError("通知类型不正确。");
}

export function normalizeNotificationReadStatus(value: unknown): NotificationReadStatus {
  if (typeof value === "string" && NOTIFICATION_READ_STATUSES.includes(value as NotificationReadStatus)) {
    return value as NotificationReadStatus;
  }
  throw new ValidationError("通知状态不正确。");
}

export function normalizeNotificationScope(value: unknown): NotificationScope {
  if (typeof value === "string" && NOTIFICATION_SCOPES.includes(value as NotificationScope)) {
    return value as NotificationScope;
  }
  throw new ValidationError("通知查看范围不正确。");
}

export function normalizeNotificationChannel(value: unknown): NotificationChannel {
  if (typeof value === "string" && NOTIFICATION_CHANNELS.includes(value as NotificationChannel)) {
    return value as NotificationChannel;
  }
  throw new ValidationError("通知渠道不正确。");
}

export function normalizeIntegrationProvider(value: unknown): IntegrationProvider {
  if (typeof value === "string" && INTEGRATION_PROVIDERS.includes(value as IntegrationProvider)) {
    return value as IntegrationProvider;
  }
  throw new ValidationError("企业连接类型不正确。");
}

export function normalizeCreateNotificationInput(input: CreateNotificationInput): CreateNotificationInput {
  return {
    companyId: normalizeIdentifier(input.companyId, "企业 ID"),
    teamId: input.teamId === undefined ? undefined : normalizeIdentifier(input.teamId, "团队 ID"),
    userId: normalizeIdentifier(input.userId, "用户 ID"),
    type: normalizeNotificationType(input.type),
    title: requiredText(input.title, "通知标题", 160),
    content: requiredText(input.content, "通知内容", 2_000),
    source: requiredText(input.source, "通知来源", 120)
  };
}

export function normalizeNotificationListQuery(query: NotificationListQuery): NotificationListQuery {
  const page = Number.isInteger(query.page) ? query.page : 1;
  const pageSize = Number.isInteger(query.pageSize) ? query.pageSize : 20;
  if (page < 1) throw new ValidationError("页码必须大于 0。");
  if (pageSize < 1 || pageSize > 100) throw new ValidationError("每页数量必须在 1 到 100 之间。");
  const userIds = Array.from(new Set(query.userIds.map((userId) => normalizeIdentifier(userId, "用户 ID"))));
  const teamIds = query.teamIds === undefined
    ? undefined
    : Array.from(new Set(query.teamIds.map((teamId) => normalizeIdentifier(teamId, "团队 ID"))));
  if (userIds.length === 0) throw new ValidationError("通知查询必须包含合法收件人。");
  if (userIds.length > 2_000) throw new ValidationError("通知查询收件人数量过多。");
  if (teamIds && teamIds.length === 0) throw new ValidationError("团队通知查询必须包含合法团队。");
  if (teamIds && teamIds.length > 500) throw new ValidationError("通知查询团队数量过多。");
  return {
    companyId: normalizeIdentifier(query.companyId, "企业 ID"),
    teamIds,
    userIds,
    type: query.type === undefined ? undefined : normalizeNotificationType(query.type),
    readStatus: query.readStatus === undefined ? undefined : normalizeNotificationReadStatus(query.readStatus),
    page,
    pageSize
  };
}

export function normalizeMarkNotificationsReadInput(
  input: MarkNotificationsReadInput
): MarkNotificationsReadInput {
  const all = input.all === true;
  const notificationIds = input.notificationIds === undefined
    ? undefined
    : Array.from(new Set(input.notificationIds.map((id) => normalizeIdentifier(id, "通知 ID"))));
  if (notificationIds && notificationIds.length > 200) {
    throw new ValidationError("单次最多标记 200 条通知。");
  }
  if (all === Boolean(notificationIds?.length)) {
    throw new ValidationError("请指定通知 ID，或选择全部标记已读。");
  }
  return {
    companyId: normalizeIdentifier(input.companyId, "企业 ID"),
    userId: normalizeIdentifier(input.userId, "用户 ID"),
    notificationIds,
    all
  };
}

export function normalizePreferenceUpdates(inputs: UpdateNotificationPreferenceInput[]) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new ValidationError("请至少提交一项通知偏好。");
  }
  const normalized = inputs.map((input) => ({
    userId: normalizeIdentifier(input.userId, "用户 ID"),
    channel: normalizeNotificationChannel(input.channel),
    enabled: (() => {
      if (typeof input.enabled !== "boolean") throw new ValidationError("通知开关格式不正确。");
      return input.enabled;
    })()
  }));
  const userIds = new Set(normalized.map((input) => input.userId));
  const channels = new Set(normalized.map((input) => input.channel));
  if (userIds.size !== 1) throw new ValidationError("通知偏好只能属于同一用户。");
  if (channels.size !== normalized.length) throw new ValidationError("通知渠道不能重复。");
  return normalized;
}

export function normalizePlainIntegrationConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("连接配置格式不正确。");
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new ValidationError("连接配置不能为空。");
  if (entries.length > 30) throw new ValidationError("连接配置字段过多。");
  const normalized = Object.fromEntries(entries.map(([key, rawValue]) => {
    const normalizedKey = requiredText(key, "配置字段名", 80);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(normalizedKey)) {
      throw new ValidationError("连接配置字段名只能包含英文字母、数字和下划线，且必须以字母开头。");
    }
    if (["__proto__", "constructor", "prototype"].includes(normalizedKey)) {
      throw new ValidationError("连接配置包含禁止使用的字段名。");
    }
    if (typeof rawValue !== "string") throw new ValidationError("连接配置值必须是文本。");
    return [normalizedKey, requiredText(rawValue, `配置字段 ${normalizedKey}`, 4_000)];
  }));
  if (JSON.stringify(normalized).length > 16_000) throw new ValidationError("连接配置内容过大。");
  return normalized;
}

const INTEGRATION_FIELDS: Record<IntegrationProvider, readonly string[]> = {
  WECHAT_WORK: ["corpId", "agentId", "corpSecret"],
  DINGTALK: ["clientId", "clientSecret"],
  FEISHU: ["appId", "appSecret"]
};

export function normalizeProviderIntegrationConfig(
  providerValue: IntegrationProvider,
  value: unknown,
  options: { partial?: boolean } = {}
) {
  const provider = normalizeIntegrationProvider(providerValue);
  const config = normalizePlainIntegrationConfig(value);
  const allowed = INTEGRATION_FIELDS[provider];
  const unknownKeys = Object.keys(config).filter((key) => !allowed.includes(key));
  if (unknownKeys.length > 0) {
    throw new ValidationError(`连接配置包含不支持的字段：${unknownKeys.join("、")}。`);
  }
  if (!options.partial) {
    const missingKeys = allowed.filter((key) => !config[key]);
    if (missingKeys.length > 0) {
      throw new ValidationError(`连接配置缺少必填字段：${missingKeys.join("、")}。`);
    }
  }
  return config;
}
