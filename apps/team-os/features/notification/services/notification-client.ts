import type {
  IntegrationListData,
  IntegrationProvider,
  NotificationChannel,
  NotificationListData,
  NotificationPreferenceData,
  NotificationReadStatus,
  NotificationScope,
  NotificationType,
  ProviderTestResult
} from "@/apps/team-os/features/notification/types";

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

export class NotificationClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "NotificationClientError";
  }
}

async function readResponse<T>(responsePromise: Response | Promise<Response>): Promise<T> {
  const response = await responsePromise;
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new NotificationClientError("接口返回格式不正确，请稍后重试。");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new NotificationClientError("接口返回格式不正确，请稍后重试。");
  }

  const body = parsed as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const errorBody = body as ApiErrorEnvelope;
    throw new NotificationClientError(
      errorBody.message || errorBody.error?.message || "消息服务请求失败，请稍后重试。",
      errorBody.code || errorBody.error?.code
    );
  }

  return body.data;
}

function withCompanyId(path: string, companyId?: string) {
  if (!companyId) return path;
  const params = new URLSearchParams({ companyId });
  return `${path}?${params.toString()}`;
}

export function fetchNotifications(input: {
  companyId?: string;
  scope?: NotificationScope;
  type?: NotificationType;
  readStatus?: NotificationReadStatus;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (input.companyId) params.set("companyId", input.companyId);
  if (input.scope) params.set("scope", input.scope);
  if (input.type) params.set("type", input.type);
  if (input.readStatus) params.set("readStatus", input.readStatus);
  params.set("page", String(input.page ?? 1));
  params.set("pageSize", String(input.pageSize ?? 10));

  return readResponse<NotificationListData>(fetch(`/api/team-os/notifications?${params.toString()}`, {
    cache: "no-store"
  }));
}

export function markNotificationsRead(input: {
  companyId: string;
  notificationIds?: string[];
  all?: boolean;
}) {
  return readResponse<{ updatedCount: number; unreadCount: number }>(fetch("/api/team-os/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function fetchNotificationPreferences(companyId?: string) {
  return readResponse<NotificationPreferenceData>(fetch(
    withCompanyId("/api/team-os/notifications/preferences", companyId),
    { cache: "no-store" }
  ));
}

export function saveNotificationPreferences(input: {
  companyId: string;
  preferences: Array<{ channel: NotificationChannel; enabled: boolean }>;
}) {
  return readResponse<NotificationPreferenceData>(fetch("/api/team-os/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function fetchIntegrations(companyId?: string) {
  return readResponse<IntegrationListData>(fetch(
    withCompanyId("/api/team-os/integrations", companyId),
    { cache: "no-store" }
  ));
}

export function saveIntegration(input: {
  companyId: string;
  provider: IntegrationProvider;
  enabled: boolean;
  config?: Record<string, string>;
}) {
  return readResponse<IntegrationListData>(fetch("/api/team-os/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function sendIntegrationTest(input: {
  companyId: string;
  provider: IntegrationProvider;
}) {
  return readResponse<ProviderTestResult>(fetch("/api/team-os/notifications/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
