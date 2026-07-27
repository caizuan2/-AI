import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  CRM_CONVERSATION_CHANNELS,
  CRM_CONVERSATION_DIRECTIONS,
  CRM_DAILY_PLAN_STATUSES,
  CRM_INTEGRATION_STATUSES,
  CRM_SALES_TARGET_METRICS,
  CRM_SALES_TARGET_STATUSES,
  CRM_VISIT_STATUSES,
  type CreateConversationInput,
  type CreateDailyPlanInput,
  type CreateIntegrationInput,
  type CreateSalesTargetInput,
  type CreateVisitInput,
  type CrmOperationsListInput,
  type UpdateVisitStatusInput
} from "@/apps/team-os/features/crm/operations/types";

const CLIENT_IDENTITY_FIELDS = new Set([
  "companyId",
  "createdById",
  "inspectedById",
  "ownerId",
  "userId"
]);

const SENSITIVE_INTEGRATION_KEYS = [
  "apikey",
  "accesstoken",
  "authtoken",
  "bearertoken",
  "clientsecret",
  "credential",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "token"
];

function assertObject(value: unknown) {
  if (!isPlainObject(value)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return value;
}

function assertNoClientIdentityFields(value: Record<string, unknown>) {
  for (const field of Array.from(CLIENT_IDENTITY_FIELDS)) {
    if (field in value) {
      throw new ValidationError(`${field} 由服务端根据登录身份确定，客户端不得提交。`);
    }
  }
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const result = value.trim();
  if (!result) return undefined;
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  label: string,
  options: readonly T[],
  fallback?: T
) {
  if ((value === undefined || value === null || value === "") && fallback) {
    return fallback;
  }
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new ValidationError(`${label}不正确。`);
  }
  return value as T;
}

function dateValue(value: unknown, label: string, fallback?: Date) {
  if ((value === undefined || value === null || value === "") && fallback) return fallback;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new ValidationError(`${label}格式不正确。`);
  }
  return result;
}

function optionalDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return dateValue(value, label);
}

function integerValue(
  value: unknown,
  label: string,
  options: { min: number; max: number; fallback?: number }
) {
  if ((value === undefined || value === null || value === "") && options.fallback !== undefined) {
    return options.fallback;
  }
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(result) || result < options.min || result > options.max) {
    throw new ValidationError(`${label}必须是 ${options.min} 到 ${options.max} 之间的整数。`);
  }
  return result;
}

function decimalText(value: unknown, label: string, options: { min: number; max: number }) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const normalized = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new ValidationError(`${label}最多保留 4 位小数。`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    throw new ValidationError(`${label}必须在 ${options.min} 到 ${options.max} 之间。`);
  }
  return normalized;
}

function stringArray(value: unknown, label: string, maxItems: number, maxLength: number) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const result = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  if (result.length > maxItems || result.some((item) => item.length > maxLength)) {
    throw new ValidationError(`${label}最多 ${maxItems} 项，每项不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function safeJsonObject(value: unknown, label: string, maxBytes = 20_000) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new ValidationError(`${label}必须是 JSON 对象。`);
  }
  if (JSON.stringify(value).length > maxBytes) {
    throw new ValidationError(`${label}内容过大。`);
  }
  return value;
}

function safeObjectArray(value: unknown, label: string, maxItems: number) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => !isPlainObject(item))) {
    throw new ValidationError(`${label}必须是 JSON 对象数组。`);
  }
  if (value.length > maxItems || JSON.stringify(value).length > 30_000) {
    throw new ValidationError(`${label}内容过多。`);
  }
  return value;
}

function urlArray(value: unknown) {
  const values = stringArray(value, "媒体地址", 20, 2_000);
  for (const item of values) {
    let parsed: URL;
    try {
      parsed = new URL(item);
    } catch {
      throw new ValidationError("媒体地址必须是有效的 HTTP 或 HTTPS URL。");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new ValidationError("媒体地址只允许 HTTP 或 HTTPS URL。");
    }
  }
  return values;
}

function normalizeSensitiveKey(key: string) {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

function assertNoSensitiveIntegrationFields(value: unknown, depth = 0) {
  if (depth > 6) {
    throw new ValidationError("集成元数据嵌套层级过深。");
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoSensitiveIntegrationFields(item, depth + 1));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeSensitiveKey(key);
    if (SENSITIVE_INTEGRATION_KEYS.some((blocked) => normalized.includes(blocked))) {
      throw new ValidationError(`集成元数据禁止包含敏感字段：${key}。`);
    }
    assertNoSensitiveIntegrationFields(child, depth + 1);
  }
}

function queryDate(value: string | null, label: string) {
  return value ? dateValue(value, label) : undefined;
}

export function parseOperationsListInput(searchParams: URLSearchParams): CrmOperationsListInput {
  for (const field of Array.from(CLIENT_IDENTITY_FIELDS)) {
    if (searchParams.has(field)) {
      throw new ValidationError(`${field} 由服务端根据登录身份确定，客户端不得提交。`);
    }
  }
  const from = queryDate(searchParams.get("from"), "开始时间");
  const to = queryDate(searchParams.get("to"), "结束时间");
  if (from && to && from > to) {
    throw new ValidationError("开始时间不能晚于结束时间。");
  }
  return {
    teamId: optionalText(searchParams.get("teamId"), "团队 ID", 120),
    customerId: optionalText(searchParams.get("customerId"), "客户 ID", 120),
    cursor: optionalText(searchParams.get("cursor"), "分页游标", 120),
    limit: integerValue(searchParams.get("limit"), "每页数量", {
      min: 1,
      max: 100,
      fallback: 20
    }),
    channel: searchParams.get("channel")
      ? enumValue(searchParams.get("channel"), "沟通来源", CRM_CONVERSATION_CHANNELS)
      : undefined,
    from,
    to
  };
}

export function parseCreateConversationInput(body: unknown): CreateConversationInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  if (value.consentConfirmed !== true) {
    throw new ValidationError("必须确认已取得录音、转写和沟通数据处理授权。");
  }
  const startedAt = dateValue(value.startedAt, "开始时间", new Date());
  const endedAt = optionalDate(value.endedAt, "结束时间");
  if (endedAt && endedAt < startedAt) {
    throw new ValidationError("结束时间不能早于开始时间。");
  }
  return {
    teamId: optionalText(value.teamId, "团队 ID", 120),
    customerId: requiredText(value.customerId, "客户 ID", 120),
    contactId: optionalText(value.contactId, "联系人 ID", 120),
    opportunityId: optionalText(value.opportunityId, "商机 ID", 120),
    integrationSourceId: optionalText(value.integrationSourceId, "集成来源 ID", 120),
    channel: enumValue(value.channel, "沟通来源", CRM_CONVERSATION_CHANNELS),
    direction: enumValue(value.direction, "沟通方向", CRM_CONVERSATION_DIRECTIONS, "OUTBOUND"),
    externalId: optionalText(value.externalId, "外部记录 ID", 200),
    title: requiredText(value.title, "沟通标题", 200),
    content: optionalText(value.content, "沟通内容", 50_000) ?? "",
    transcript: optionalText(value.transcript, "沟通转写", 100_000) ?? "",
    summary: optionalText(value.summary, "沟通摘要", 5_000) ?? "",
    startedAt,
    endedAt,
    durationSeconds: integerValue(value.durationSeconds, "沟通时长", {
      min: 0,
      max: 86_400,
      fallback: 0
    }),
    mediaUrls: urlArray(value.mediaUrls),
    metadata: safeJsonObject(value.metadata, "沟通元数据"),
    consentConfirmed: true
  };
}

export function parseCreateDailyPlanInput(body: unknown): CreateDailyPlanInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  return {
    teamId: optionalText(value.teamId, "团队 ID", 120),
    planDate: dateValue(value.planDate, "计划日期", new Date()),
    status: enumValue(value.status, "计划状态", CRM_DAILY_PLAN_STATUSES, "DRAFT"),
    goals: safeJsonObject(value.goals, "计划目标"),
    keyCustomerIds: stringArray(value.keyCustomerIds, "重点客户", 30, 120),
    actionItems: safeObjectArray(value.actionItems, "行动项", 50),
    completedSummary: optionalText(value.completedSummary, "完成总结", 10_000) ?? ""
  };
}

export function parseCreateSalesTargetInput(body: unknown): CreateSalesTargetInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  const periodStart = dateValue(value.periodStart, "目标开始日期");
  const periodEnd = dateValue(value.periodEnd, "目标结束日期");
  const days = (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;
  if (days < 0 || days > 366) {
    throw new ValidationError("目标周期必须在 0 到 366 天之间。");
  }
  return {
    teamId: optionalText(value.teamId, "团队 ID", 120),
    targetUserId: optionalText(value.targetUserId, "目标成员 ID", 120),
    metric: enumValue(value.metric, "目标指标", CRM_SALES_TARGET_METRICS),
    periodStart,
    periodEnd,
    targetValue: decimalText(value.targetValue, "目标值", { min: 0.0001, max: 1_000_000_000_000 }),
    status: enumValue(value.status, "目标状态", CRM_SALES_TARGET_STATUSES, "ACTIVE")
  };
}

export function parseCreateIntegrationInput(body: unknown): CreateIntegrationInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  assertNoSensitiveIntegrationFields(value);
  return {
    teamId: optionalText(value.teamId, "团队 ID", 120),
    channel: enumValue(value.channel, "集成渠道", CRM_CONVERSATION_CHANNELS),
    name: requiredText(value.name, "集成名称", 120),
    status: enumValue(value.status, "集成状态", CRM_INTEGRATION_STATUSES, "ACTIVE"),
    externalTenantId: optionalText(value.externalTenantId, "外部租户 ID", 200),
    config: safeJsonObject(value.config, "非敏感集成元数据")
  };
}

export function parseCreateVisitInput(body: unknown): CreateVisitInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  const plannedStart = dateValue(value.plannedStart, "计划开始时间");
  const plannedEnd = optionalDate(value.plannedEnd, "计划结束时间");
  if (plannedEnd && plannedEnd < plannedStart) {
    throw new ValidationError("计划结束时间不能早于开始时间。");
  }
  return {
    teamId: optionalText(value.teamId, "团队 ID", 120),
    customerId: requiredText(value.customerId, "客户 ID", 120),
    contactId: optionalText(value.contactId, "联系人 ID", 120),
    title: requiredText(value.title, "拜访主题", 200),
    purpose: requiredText(value.purpose, "拜访目的", 3_000),
    plannedStart,
    plannedEnd,
    address: optionalText(value.address, "拜访地址", 500),
    latitude: value.latitude === undefined
      ? undefined
      : decimalText(value.latitude, "纬度", { min: -90, max: 90 }),
    longitude: value.longitude === undefined
      ? undefined
      : decimalText(value.longitude, "经度", { min: -180, max: 180 })
  };
}

export function parseUpdateVisitStatusInput(body: unknown): UpdateVisitStatusInput {
  const value = assertObject(body);
  assertNoClientIdentityFields(value);
  return {
    id: requiredText(value.id, "拜访计划 ID", 120),
    status: enumValue(value.status, "拜访状态", CRM_VISIT_STATUSES),
    actualStart: optionalDate(value.actualStart, "实际开始时间"),
    actualEnd: optionalDate(value.actualEnd, "实际结束时间"),
    signInAt: optionalDate(value.signInAt, "签到时间"),
    signInLocation: optionalText(value.signInLocation, "签到位置", 500),
    result: optionalText(value.result, "拜访结果", 10_000),
    nextAction: optionalText(value.nextAction, "下一步行动", 5_000)
  };
}

export function parseOperationId(value: string, label: string) {
  return requiredText(value, label, 120);
}
