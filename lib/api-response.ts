import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { AppError, ConfigError, toAppError } from "@/lib/errors";
import type { AppErrorCode } from "@/lib/errors";
import { logger, REQUEST_ID_HEADER, toSafeErrorLog } from "@/lib/logger";
import { getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";

export type ApiSuccessResponse<T> = {
  ok: true;
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  ok: false;
  code: AppErrorCode;
  message: string;
  requestId?: string;
  success: false;
  error: {
    code: AppErrorCode;
    message: string;
    requestId?: string;
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

  return NextResponse.json<ApiSuccessResponse<T>>({ ok: true, success: true, data }, responseInit.init);
}

function isDatabaseErrorCode(code: AppErrorCode) {
  return [
    "DATABASE_ERROR",
    "MISSING_DATABASE_URL",
    "INVALID_DATABASE_URL",
    "DATABASE_CONNECTION_FAILED",
    "DATABASE_SCHEMA_MISSING",
    "INGEST_WRITE_FAILED"
  ].includes(code);
}

export function apiError(error: unknown, init?: ResponseInit) {
  const appError = toAppError(error);
  const responseInit = withRequestIdHeader(init);
  const level = appError.statusCode >= 500 ? "error" : "warn";

  logger[level]("api.error", {
    requestId: responseInit.requestId,
    code: appError.code,
    statusCode: appError.statusCode,
    ...(isDatabaseErrorCode(appError.code) ? { database: getSafeDatabaseUrlInfo() } : {}),
    error: toSafeErrorLog(error)
  });

  return NextResponse.json<ApiErrorResponse>(
    {
      ok: false,
      code: appError.code,
      message: appError.message,
      requestId: responseInit.requestId,
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        requestId: responseInit.requestId
      }
    },
    {
      ...responseInit.init,
      status: appError.statusCode
    }
  );
}

export function databaseConfigError(action: string) {
  const info = getSafeDatabaseUrlInfo();

  if (!info.present) {
    return new AppError("MISSING_DATABASE_URL", `DATABASE_URL 未配置，无法${action}。`, 500);
  }

  return new AppError("INVALID_DATABASE_URL", `DATABASE_URL 配置无效，无法${action}。`, 500);
}

export function sessionConfigError(action: string) {
  return new ConfigError(`认证密钥未配置，无法${action}。请在 Netlify 设置 SESSION_SECRET。`);
}
