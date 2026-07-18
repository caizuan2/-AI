import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  CUSTOMER_FOLLOW_UP_TYPES,
  CUSTOMER_LEVELS,
  CUSTOMER_STAGES,
  type AnalyzeCustomerInput,
  type CreateCustomerFollowUpInput,
  type CreateCustomerInput,
  type CustomerFollowUpType,
  type CustomerLevel,
  type CustomerListFilters,
  type CustomerStage
} from "@/apps/team-os/features/crm/types";

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
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }
  const result = value.trim();
  if (!result) {
    return undefined;
  }
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return result;
}

function tags(value: unknown) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError("客户标签格式不正确。");
  }
  const result = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  if (result.length > 20 || result.some((item) => item.length > 40)) {
    throw new ValidationError("客户标签最多 20 个，每个不能超过 40 个字符。");
  }
  return result;
}

function stage(value: string | null): CustomerStage | undefined {
  if (!value) return undefined;
  if (!CUSTOMER_STAGES.includes(value as CustomerStage)) {
    throw new ValidationError("客户阶段筛选值不正确。");
  }
  return value as CustomerStage;
}

function level(value: string | null): CustomerLevel | undefined {
  if (!value) return undefined;
  if (!CUSTOMER_LEVELS.includes(value as CustomerLevel)) {
    throw new ValidationError("客户等级筛选值不正确。");
  }
  return value as CustomerLevel;
}

function followUpType(value: unknown): CustomerFollowUpType {
  if (typeof value !== "string" || !CUSTOMER_FOLLOW_UP_TYPES.includes(value as CustomerFollowUpType)) {
    throw new ValidationError("跟进类型不正确。");
  }
  return value as CustomerFollowUpType;
}

export function parseCustomerListFilters(searchParams: URLSearchParams): CustomerListFilters {
  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : 20;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    throw new ValidationError("每页数量必须是 1 到 50 之间的整数。");
  }

  return {
    companyId: optionalText(searchParams.get("companyId"), "企业 ID", 120),
    teamId: optionalText(searchParams.get("teamId"), "团队 ID", 120),
    search: optionalText(searchParams.get("q"), "搜索内容", 100),
    stage: stage(searchParams.get("stage")),
    level: level(searchParams.get("level")),
    tag: optionalText(searchParams.get("tag"), "标签", 40),
    cursor: optionalText(searchParams.get("cursor"), "分页游标", 120),
    limit: parsedLimit
  };
}

export function parseCreateCustomerInput(body: unknown): CreateCustomerInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  const phone = optionalText(body.phone, "手机号", 40);
  const wechat = optionalText(body.wechat, "微信号", 80);
  if (!phone && !wechat) {
    throw new ValidationError("手机号和微信号至少填写一项。");
  }

  return {
    teamId: requiredText(body.teamId, "所属团队", 120),
    ownerId: optionalText(body.ownerId, "负责人 ID", 120),
    name: requiredText(body.name, "客户姓名", 120),
    phone,
    wechat,
    source: requiredText(body.source, "客户来源", 120),
    tags: tags(body.tags),
    notes: optionalText(body.notes, "客户备注", 5_000) ?? ""
  };
}

export function parseCreateCustomerFollowUpInput(body: unknown): CreateCustomerFollowUpInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    customerId: requiredText(body.customerId, "客户 ID", 120),
    content: requiredText(body.content, "跟进记录", 10_000),
    summary: requiredText(body.summary, "沟通总结", 3_000),
    nextPlan: requiredText(body.nextPlan, "下一步计划", 3_000),
    type: followUpType(body.type)
  };
}

export function parseAnalyzeCustomerInput(body: unknown): AnalyzeCustomerInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return {
    customerId: requiredText(body.customerId, "客户 ID", 120),
    conversation: optionalText(body.conversation, "补充沟通内容", 20_000)
  };
}

export function parseCustomerId(value: string) {
  return requiredText(value, "客户 ID", 120);
}
