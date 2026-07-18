import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  COACH_PROVIDER_NAMES,
  type AnalyzeConversationInput,
  type CoachProviderName
} from "@/apps/team-os/features/ai-coach/types";

const MAX_CONVERSATION_LENGTH = 30_000;
const MAX_SCREENSHOT_URLS = 6;
const MAX_URL_LENGTH = 2_048;

function requiredIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }

  const identifier = value.trim();
  if (identifier.length > 160) {
    throw new ValidationError(`${label}格式不正确。`);
  }

  return identifier;
}

function optionalIdentifier(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requiredIdentifier(value, label);
}

function conversationText(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ValidationError("聊天记录必须是文本。");
  }

  const conversation = value.trim();
  if (conversation.length > MAX_CONVERSATION_LENGTH) {
    throw new ValidationError(`聊天记录不能超过 ${MAX_CONVERSATION_LENGTH} 个字符。`);
  }

  return conversation;
}

function screenshotUrls(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_SCREENSHOT_URLS) {
    throw new ValidationError(`聊天截图地址最多允许 ${MAX_SCREENSHOT_URLS} 个。`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.length > MAX_URL_LENGTH) {
      throw new ValidationError("聊天截图地址格式不正确。");
    }

    try {
      const url = new URL(item.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("unsupported protocol");
      }
      return url.toString();
    } catch {
      throw new ValidationError("聊天截图地址必须是有效的 HTTP(S) URL。");
    }
  });
}

function providerName(value: unknown): CoachProviderName | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !COACH_PROVIDER_NAMES.includes(value as CoachProviderName)) {
    throw new ValidationError("AI 模型提供方不受支持。");
  }

  return value as CoachProviderName;
}

export function parseAnalyzeConversationInput(body: unknown): AnalyzeConversationInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const conversation = conversationText(body.conversation);
  const submissionId = optionalIdentifier(body.submissionId, "任务提交 ID");

  if (!conversation && !submissionId) {
    throw new ValidationError("请提供聊天记录或任务提交记录。");
  }

  return {
    conversation,
    screenshotUrls: screenshotUrls(body.screenshotUrls),
    employeeId: optionalIdentifier(body.employeeId, "员工 ID"),
    teamId: requiredIdentifier(body.teamId, "团队 ID"),
    submissionId,
    provider: providerName(body.provider)
  };
}

export function parseCoachTeamId(value: string | null) {
  return value?.trim() ? requiredIdentifier(value, "团队 ID") : undefined;
}

export function parseCoachReportId(value: string) {
  return requiredIdentifier(value, "报告 ID");
}
