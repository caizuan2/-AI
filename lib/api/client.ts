import type { ApiResponse } from "@/lib/api-response";
import type { AppErrorCode } from "@/lib/errors";

const friendlyMessages: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: "输入内容有误，请检查后再试。",
  UNAUTHORIZED: "请先登录后再继续。",
  FORBIDDEN: "当前账号没有权限访问该功能。",
  NOT_FOUND: "没有找到对应内容。",
  AI_ERROR: "AI 服务暂时不可用，请稍后重试。",
  DATABASE_ERROR: "数据库暂不可用，请检查本地数据库配置。",
  RATE_LIMITED: "请求过于频繁，请稍后再试。",
  APP_ERROR: "请求处理失败，请稍后重试。"
};

function getFriendlyErrorMessage(code: AppErrorCode, message: string, fallback: string) {
  if (code === "APP_ERROR") {
    return friendlyMessages.APP_ERROR;
  }

  return message || friendlyMessages[code] || fallback;
}

export async function unwrapApiResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: ApiResponse<T>;

  try {
    data = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error(fallback);
  }

  if (data.success) {
    return data.data;
  }

  const friendlyMessage = getFriendlyErrorMessage(data.error.code, data.error.message, fallback);

  throw new Error(friendlyMessage);
}

export async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ApiResponse<unknown>;

    if (!data.success) {
      return getFriendlyErrorMessage(data.error.code, data.error.message, fallback);
    }

    return fallback;
  } catch {
    return fallback;
  }
}
