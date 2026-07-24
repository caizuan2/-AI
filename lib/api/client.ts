import type { ApiResponse } from "@/lib/api-response";
import type { AppErrorCode } from "@/lib/errors";

const friendlyMessages: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: "输入内容有误，请检查后再试。",
  INVALID_INPUT: "输入内容有误，请检查后再试。",
  UNAUTHORIZED: "请先登录后再继续。",
  FORBIDDEN: "当前账号没有权限访问该功能。",
  FEATURE_DISABLED: "该功能暂未开放，请联系超级管理员。",
  LICENSE_REQUIRED: "请先输入卡密激活知识库。",
  LICENSE_NOT_FOUND: "卡密不存在或无效。",
  INVALID_LICENSE_KEY: "卡密格式无效。",
  LICENSE_APP_TYPE_MISMATCH: "卡密不适用于当前客户端。",
  LICENSE_DISABLED: "卡密已禁用。",
  LICENSE_EXPIRED: "卡密已过期。",
  LICENSE_ACTIVATION_LIMIT_REACHED: "卡密激活次数已达上限。",
  LICENSE_USED: "卡密已使用。",
  LICENSE_APP_MISMATCH: "卡密不属于当前应用。",
  INGEST_FULL_ACCESS_REQUIRED: "当前账号仅支持投喂端对话，需要投喂端卡密才能使用该功能。",
  USER_NOT_AUTHENTICATED: "当前账号未登录，请先登录。",
  REDEEM_FAILED: "卡密激活失败，请稍后重试。",
  NOT_FOUND: "没有找到对应内容。",
  NOT_IMPLEMENTED: "该接口暂未接入。",
  AI_ERROR: "AI 服务暂时不可用，请稍后重试。",
  MISSING_AI_API_KEY: "AI 服务未配置，请联系管理员。",
  MISSING_QWEN_API_KEY: "Qwen 服务未配置，请联系管理员。",
  MISSING_EMBEDDING_API_KEY: "Embedding 服务未配置，请联系管理员。",
  AI_RATE_LIMITED: "AI 请求过于频繁，请稍后再试。",
  AI_QUOTA_EXCEEDED: "AI 额度不足，请联系管理员检查账号额度。",
  AI_PROVIDER_FAILED: "AI provider 调用失败，请稍后再试。",
  QWEN_REQUEST_FAILED: "Qwen 调用失败，系统会尝试使用兜底模型。",
  OPENAI_REQUEST_FAILED: "OpenAI 调用失败，请稍后再试。",
  DEEPSEEK_REQUEST_FAILED: "DeepSeek 调用失败，请稍后再试。",
  AI_REQUEST_FAILED: "AI 接口调用失败，请稍后重试。",
  EMBEDDING_FAILED: "向量生成失败，请稍后再试。",
  VECTOR_SEARCH_FAILED: "向量检索失败，请稍后再试。",
  DATABASE_ERROR: "数据库暂不可用，请检查本地数据库配置。",
  MISSING_DATABASE_URL: "数据库未配置，请联系管理员。",
  INVALID_DATABASE_URL: "数据库连接配置无效，请联系管理员。",
  DATABASE_CONNECTION_FAILED: "数据库连接失败，请联系管理员。",
  DATABASE_SCHEMA_MISSING: "数据库表结构未就绪，请联系管理员执行迁移。",
  DATABASE_ROLE_ENUM_UNSUPPORTED: "当前数据库角色配置不兼容，请联系管理员。",
  INGEST_WRITE_FAILED: "知识入库失败，请稍后重试。",
  CONFIG_ERROR: "系统配置未完成，请联系管理员。",
  RATE_LIMITED: "请求过于频繁，请稍后再试。",
  APP_ERROR: "请求处理失败，请稍后重试。",
  UNKNOWN_ERROR: "请求处理失败，请稍后重试。"
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly details: {
      code: AppErrorCode;
      requestId?: string;
      status: number;
      body?: unknown;
    }
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readApiErrorCode(payload: unknown): AppErrorCode | null {
  const root = isRecord(payload) ? payload : null;
  const data = root && isRecord(root.data) ? root.data : root;
  const rootError = root && isRecord(root.error) ? root.error : null;
  const dataError = data && isRecord(data.error) ? data.error : null;
  const candidates = [
    rootError?.code,
    root?.code,
    root?.errorCode,
    dataError?.code,
    data?.code,
    data?.errorCode
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate as AppErrorCode;
    }
  }

  return null;
}

function formatErrorMessage(input: {
  code: AppErrorCode;
  message: string;
  fallback: string;
  requestId?: string;
}) {
  const message = input.message || friendlyMessages[input.code] || input.fallback;
  const lines = [`请求处理失败：${message}`];

  lines.push(`错误码：${input.code}`);

  if (input.requestId) {
    lines.push(`请求ID：${input.requestId}`);
  }

  return lines.join("\n");
}

export async function unwrapApiResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: (ApiResponse<T> & {
    code?: AppErrorCode;
    message?: string;
    requestId?: string;
  });

  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error(fallback);
  }

  if (data.success) {
    return data.data;
  }

  const code = readApiErrorCode(data) ?? "UNKNOWN_ERROR";
  const requestId = data.error?.requestId ?? data.requestId ?? response.headers.get("x-request-id") ?? undefined;
  const message = data.error?.message ?? data.message ?? friendlyMessages[code] ?? fallback;
  const friendlyMessage = formatErrorMessage({
    code,
    message,
    fallback,
    requestId
  });

  if (typeof window !== "undefined") {
    console.error("api.request_failed", {
      status: response.status,
      code,
      message,
      requestId,
      body: data
    });
  }

  throw new ApiClientError(friendlyMessage, {
    code,
    requestId,
    status: response.status,
    body: data
  });
}

export async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as (ApiResponse<unknown> & {
      code?: AppErrorCode;
      message?: string;
      requestId?: string;
    });

    if (!data.success) {
      const code = readApiErrorCode(data) ?? "UNKNOWN_ERROR";
      const requestId = data.error?.requestId ?? data.requestId ?? response.headers.get("x-request-id") ?? undefined;

      return formatErrorMessage({
        code,
        message: data.error?.message ?? data.message ?? "",
        fallback,
        requestId
      });
    }

    return fallback;
  } catch {
    return fallback;
  }
}
