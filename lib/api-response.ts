import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { AppError, ConfigError, toAppError } from "@/lib/errors";
import type { AppErrorCode } from "@/lib/errors";
import { logger, REQUEST_ID_HEADER, toSafeErrorLog } from "@/lib/logger";

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: AppErrorCode;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

function getCurrentRequestId() {
  try {
    return headers().get(REQUEST_ID_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
}

function withRequestIdHeader(init?: ResponseInit) {
  const requestId = getCurrentRequestId();
  const responseHeaders = new Headers(init?.headers);

  if (requestId) {
    responseHeaders.set(REQUEST_ID_HEADER, requestId);
  }

  return {
    requestId,
    init: {
      ...init,
      headers: responseHeaders
    }
  };
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  const responseInit = withRequestIdHeader(init);

  return NextResponse.json<ApiSuccessResponse<T>>({ success: true, data }, responseInit.init);
}

export function apiError(error: unknown, init?: ResponseInit) {
  const appError = toAppError(error);
  const responseInit = withRequestIdHeader(init);
  const level = appError.statusCode >= 500 ? "error" : "warn";

  logger[level]("api.error", {
    requestId: responseInit.requestId,
    code: appError.code,
    statusCode: appError.statusCode,
    error: toSafeErrorLog(error)
  });

  return NextResponse.json<ApiErrorResponse>(
    {
      success: false,
      error: {
        code: appError.code,
        message: appError.message
      }
    },
    {
      ...responseInit.init,
      status: appError.statusCode
    }
  );
}

export function databaseConfigError(action: string) {
  return new AppError("DATABASE_ERROR", `数据库未配置，无法${action}。`, 500);
}

export function sessionConfigError(action: string) {
  return new ConfigError(`认证密钥未配置，无法${action}。请在 Netlify 设置 SESSION_SECRET。`);
}
