import "server-only";

import { ValidationError } from "@/lib/errors";

export interface QuickActionCategoryRecord {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string | null;
  action: string | null;
  prompt: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface QuickActionCategoryInput {
  name: string;
  description: string | null;
  icon: string | null;
  type: string | null;
  action: string | null;
  prompt: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface QuickActionCategoryView extends QuickActionCategoryInput {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

const MAX_NAME_LENGTH = 40;
const MAX_SHORT_FIELD_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_PROMPT_LENGTH = 1000;

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName}必须是字符串。`);
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  if (text.length > maxLength) {
    throw new ValidationError(`${fieldName}不能超过 ${maxLength} 个字符。`);
  }

  return text;
}

function readRequiredName(value: unknown) {
  const name = readOptionalString(value, "分类名称", MAX_NAME_LENGTH);

  if (!name) {
    throw new ValidationError("分类名称不能为空。");
  }

  return name;
}

function readEnabled(value: unknown, fallback = true) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError("启用状态必须是 boolean。");
  }

  return value;
}

function readSortOrder(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const sortOrder = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isInteger(sortOrder)) {
    throw new ValidationError("排序必须是整数。");
  }

  return sortOrder;
}

export function parseQuickActionInput(body: Record<string, unknown>, fallback?: Partial<QuickActionCategoryInput>): QuickActionCategoryInput {
  return {
    name: "name" in body ? readRequiredName(body.name) : readRequiredName(fallback?.name),
    description: "description" in body
      ? readOptionalString(body.description, "描述", MAX_DESCRIPTION_LENGTH)
      : fallback?.description ?? null,
    icon: "icon" in body
      ? readOptionalString(body.icon, "图标", MAX_SHORT_FIELD_LENGTH)
      : fallback?.icon ?? null,
    type: "type" in body
      ? readOptionalString(body.type, "类型", MAX_SHORT_FIELD_LENGTH)
      : fallback?.type ?? null,
    action: "action" in body
      ? readOptionalString(body.action, "点击动作", MAX_SHORT_FIELD_LENGTH)
      : fallback?.action ?? null,
    prompt: "prompt" in body
      ? readOptionalString(body.prompt, "快捷提示词", MAX_PROMPT_LENGTH)
      : fallback?.prompt ?? null,
    enabled: "enabled" in body ? readEnabled(body.enabled, fallback?.enabled ?? true) : fallback?.enabled ?? true,
    sortOrder: "sortOrder" in body ? readSortOrder(body.sortOrder, fallback?.sortOrder ?? 0) : fallback?.sortOrder ?? 0
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeAdminQuickAction(item: QuickActionCategoryRecord): QuickActionCategoryView {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    icon: item.icon,
    type: item.type,
    action: item.action,
    prompt: item.prompt,
    enabled: item.enabled,
    sortOrder: item.sortOrder,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt)
  };
}

export function serializePublicQuickAction(item: QuickActionCategoryRecord): QuickActionCategoryView {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    icon: item.icon,
    type: item.type,
    action: item.action,
    prompt: item.prompt,
    enabled: item.enabled,
    sortOrder: item.sortOrder
  };
}
