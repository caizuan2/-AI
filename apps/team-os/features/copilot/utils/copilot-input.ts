import { ValidationError } from "@/lib/errors";
import {
  COPILOT_ASSISTANT_ROLES,
  type CopilotAssistantRole,
  type CopilotChatInput,
  type CopilotInsightSyncInput
} from "@/apps/team-os/features/copilot/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(`请求包含不支持的字段：${unknown.join("、")}。`);
  }
}

export function parseCopilotAssistantRole(value: unknown): CopilotAssistantRole {
  if (typeof value === "string" && COPILOT_ASSISTANT_ROLES.includes(value as CopilotAssistantRole)) {
    return value as CopilotAssistantRole;
  }
  throw new ValidationError("AI 助手角色不正确。");
}

export function parseCopilotCompanyId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new ValidationError("企业 ID 格式不正确。");
  }
  return value.trim();
}

export function parseCopilotQuery(searchParams: URLSearchParams) {
  return {
    companyId: parseCopilotCompanyId(searchParams.get("companyId"))
  };
}

export function parseCopilotInsightsQuery(searchParams: URLSearchParams) {
  return {
    companyId: parseCopilotCompanyId(searchParams.get("companyId")),
    assistantRole: parseCopilotAssistantRole(
      searchParams.get("assistantRole") || "EMPLOYEE_ASSISTANT"
    )
  };
}

export function parseCopilotChatInput(value: unknown): CopilotChatInput {
  if (!isRecord(value)) throw new ValidationError("请求体必须是 JSON 对象。");
  assertOnlyKeys(value, ["assistantRole", "companyId", "message"]);
  if (typeof value.message !== "string" || !value.message.trim()) {
    throw new ValidationError("请输入要咨询的问题。");
  }
  const message = value.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (message.length > 500) throw new ValidationError("单次咨询不能超过 500 个字符。");
  return {
    assistantRole: parseCopilotAssistantRole(value.assistantRole),
    companyId: parseCopilotCompanyId(value.companyId),
    message
  };
}

export function parseCopilotInsightSyncInput(value: unknown): CopilotInsightSyncInput {
  if (!isRecord(value)) throw new ValidationError("请求体必须是 JSON 对象。");
  assertOnlyKeys(value, ["assistantRole", "companyId"]);
  return {
    assistantRole: parseCopilotAssistantRole(value.assistantRole),
    companyId: parseCopilotCompanyId(value.companyId)
  };
}
