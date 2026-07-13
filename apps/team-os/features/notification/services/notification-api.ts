import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  INTEGRATION_PROVIDERS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_READ_STATUSES,
  NOTIFICATION_SCOPES,
  NOTIFICATION_TYPES,
  type IntegrationProvider,
  type NotificationChannel,
  type NotificationReadStatus,
  type NotificationScope,
  type NotificationType
} from "@/apps/team-os/features/notification/types";
import {
  getIntegrationsForViewer,
  getNotificationPreferencesForViewer,
  listNotificationsForViewer,
  markAsRead,
  saveIntegrationForViewer,
  saveNotificationPreferencesForViewer,
  testIntegrationForViewer
} from "@/apps/team-os/services/notification";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";

const MAX_BODY_BYTES = 32 * 1024;
const apiError = createTeamOsApiErrorHandler("NOTIFICATION");
const MAX_IDENTIFIER_LENGTH = 191;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

class NotificationRateLimitError extends RateLimitError {
  readonly responseHeaders: HeadersInit;

  constructor(message: string, responseHeaders: HeadersInit) {
    super(message);
    this.responseHeaders = responseHeaders;
  }
}

function notificationApiError(error: unknown) {
  return error instanceof NotificationRateLimitError
    ? apiError(error, { headers: error.responseHeaders })
    : apiError(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ValidationError(`请求包含不支持的字段：${unknownKeys.join("、")}。`);
  }
}

function optionalIdentifier(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ValidationError(`${label}格式不正确。`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new ValidationError(`${label}不能超过 ${MAX_IDENTIFIER_LENGTH} 个字符。`);
  }
  return normalized;
}

function requiredIdentifier(value: unknown, label: string) {
  const normalized = optionalIdentifier(value, label);
  if (!normalized) throw new ValidationError(`${label}不能为空。`);
  return normalized;
}

function optionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  throw new ValidationError(`${label}不正确。`);
}

function positiveInteger(value: string | null, fallback: number, label: string, maximum: number) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError(`${label}必须是大于 0 的整数。`);
  }
  if (parsed > maximum) {
    throw new ValidationError(`${label}不能超过 ${maximum}。`);
  }
  return parsed;
}

async function readJsonObject(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new ValidationError("请求内容不能超过 32 KiB。");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError("请求体必须是合法 JSON 对象。");
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let json = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ValidationError("请求内容不能超过 32 KiB。");
      }
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
    const parsed = JSON.parse(json) as unknown;
    if (!isRecord(parsed)) throw new ValidationError("请求体必须是 JSON 对象。");
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("请求体必须是合法 JSON 对象。");
  }
}

async function writeRateLimit(
  request: Request,
  userId: string,
  namespace: string,
  limit: number
) {
  const result = await checkPersistentRateLimit(request, {
    namespace,
    userId,
    limit,
    globalLimit: Math.max(limit * 20, 100),
    windowMs: 15 * 60 * 1_000
  });
  if (!result.allowed) {
    throw new NotificationRateLimitError(
      `操作过于频繁，请 ${result.retryAfterSeconds} 秒后再试。`,
      rateLimitHeaders(result)
    );
  }
  return rateLimitHeaders(result);
}

function optionalStringConfig(value: unknown) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ValidationError("连接配置必须是 JSON 对象。");
  const result: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string") {
      throw new ValidationError("连接配置值必须是文本。");
    }
    result[key] = entryValue;
  }
  return result;
}

export async function handleNotificationsGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业消息"));
    const params = new URL(request.url).searchParams;
    const data = await listNotificationsForViewer({
      userId: user.id,
      companyId: optionalIdentifier(params.get("companyId"), "企业 ID"),
      scope: optionalEnum(params.get("scope"), NOTIFICATION_SCOPES, "通知范围") as NotificationScope | undefined,
      type: optionalEnum(params.get("type"), NOTIFICATION_TYPES, "通知类型") as NotificationType | undefined,
      readStatus: optionalEnum(
        params.get("readStatus"),
        NOTIFICATION_READ_STATUSES,
        "通知状态"
      ) as NotificationReadStatus | undefined,
      page: positiveInteger(params.get("page"), 1, "页码", MAX_PAGE),
      pageSize: positiveInteger(params.get("pageSize"), 20, "每页数量", MAX_PAGE_SIZE)
    });
    return apiSuccess(data);
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleNotificationsReadPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("标记企业消息"));
    const headers = await writeRateLimit(request, user.id, "team-os-notifications-read", 120);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["companyId", "notificationIds", "all"]);
    if (body.all !== undefined && typeof body.all !== "boolean") {
      throw new ValidationError("全部标记状态必须是布尔值。");
    }
    const notificationIds = body.notificationIds === undefined
      ? undefined
      : Array.isArray(body.notificationIds)
        ? body.notificationIds.map((id) => requiredIdentifier(id, "通知 ID"))
        : (() => { throw new ValidationError("通知 ID 列表格式不正确。"); })();
    if (notificationIds && notificationIds.length > 200) {
      throw new ValidationError("单次最多标记 200 条通知。");
    }
    const result = await markAsRead({
      companyId: requiredIdentifier(body.companyId, "企业 ID"),
      userId: user.id,
      notificationIds,
      all: body.all === true
    });
    return apiSuccess(result, { headers });
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleNotificationPreferencesGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取通知设置"));
    const companyId = optionalIdentifier(new URL(request.url).searchParams.get("companyId"), "企业 ID");
    return apiSuccess(await getNotificationPreferencesForViewer({ userId: user.id, companyId }));
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleNotificationPreferencesPut(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存通知设置"));
    const headers = await writeRateLimit(request, user.id, "team-os-notification-preferences", 30);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["companyId", "preferences"]);
    if (!Array.isArray(body.preferences)) throw new ValidationError("通知偏好列表格式不正确。");
    if (body.preferences.length > NOTIFICATION_CHANNELS.length) {
      throw new ValidationError("通知偏好数量超出支持范围。");
    }
    const preferences = body.preferences.map((item) => {
      if (!isRecord(item)) throw new ValidationError("通知偏好格式不正确。");
      assertOnlyKeys(item, ["channel", "enabled"]);
      if (typeof item.enabled !== "boolean") throw new ValidationError("通知偏好开关必须是布尔值。");
      return {
        channel: optionalEnum(item.channel, NOTIFICATION_CHANNELS, "通知渠道") as NotificationChannel,
        enabled: item.enabled
      };
    });
    if (preferences.some((preference) => !preference.channel)) {
      throw new ValidationError("通知渠道不能为空。");
    }
    const result = await saveNotificationPreferencesForViewer({
      userId: user.id,
      companyId: requiredIdentifier(body.companyId, "企业 ID"),
      preferences
    });
    return apiSuccess(result, { headers });
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleIntegrationsGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业连接"));
    const companyId = optionalIdentifier(new URL(request.url).searchParams.get("companyId"), "企业 ID");
    return apiSuccess(await getIntegrationsForViewer({ userId: user.id, companyId }));
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleIntegrationsPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存企业连接"));
    const headers = await writeRateLimit(request, user.id, "team-os-integration-config", 10);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["companyId", "provider", "enabled", "config"]);
    if (typeof body.enabled !== "boolean") throw new ValidationError("连接启用状态必须是布尔值。");
    const provider = optionalEnum(
      body.provider,
      INTEGRATION_PROVIDERS,
      "企业连接类型"
    ) as IntegrationProvider | undefined;
    if (!provider) throw new ValidationError("企业连接类型不能为空。");
    const result = await saveIntegrationForViewer({
      userId: user.id,
      request: {
        companyId: requiredIdentifier(body.companyId, "企业 ID"),
        provider,
        enabled: body.enabled,
        config: optionalStringConfig(body.config)
      }
    });
    return apiSuccess(result, { headers });
  } catch (error) {
    return notificationApiError(error);
  }
}

export async function handleNotificationTestPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("测试企业连接"));
    const headers = await writeRateLimit(request, user.id, "team-os-integration-test", 10);
    const body = await readJsonObject(request);
    assertOnlyKeys(body, ["companyId", "provider"]);
    const provider = optionalEnum(
      body.provider,
      INTEGRATION_PROVIDERS,
      "企业连接类型"
    ) as IntegrationProvider | undefined;
    if (!provider) throw new ValidationError("企业连接类型不能为空。");
    const result = await testIntegrationForViewer({
      userId: user.id,
      companyId: requiredIdentifier(body.companyId, "企业 ID"),
      provider
    });
    return apiSuccess(result, { headers });
  } catch (error) {
    return notificationApiError(error);
  }
}
