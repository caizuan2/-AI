export type AppErrorCode =
  | "APP_ERROR"
  | "UNKNOWN_ERROR"
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "FEATURE_DISABLED"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "AI_ERROR"
  | "MISSING_AI_API_KEY"
  | "MISSING_QWEN_API_KEY"
  | "MISSING_EMBEDDING_API_KEY"
  | "AI_RATE_LIMITED"
  | "AI_QUOTA_EXCEEDED"
  | "AI_PROVIDER_FAILED"
  | "QWEN_REQUEST_FAILED"
  | "OPENAI_REQUEST_FAILED"
  | "DEEPSEEK_REQUEST_FAILED"
  | "AI_REQUEST_FAILED"
  | "EMBEDDING_FAILED"
  | "VECTOR_SEARCH_FAILED"
  | "DATABASE_ERROR"
  | "MISSING_DATABASE_URL"
  | "INVALID_DATABASE_URL"
  | "DATABASE_CONNECTION_FAILED"
  | "DATABASE_SCHEMA_MISSING"
  | "INGEST_WRITE_FAILED"
  | "CONFIG_ERROR"
  | "LICENSE_REQUIRED"
  | "LICENSE_NOT_FOUND"
  | "INVALID_LICENSE_KEY"
  | "LICENSE_APP_TYPE_MISMATCH"
  | "LICENSE_DISABLED"
  | "LICENSE_EXPIRED"
  | "LICENSE_ACTIVATION_LIMIT_REACHED"
  | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode = "APP_ERROR",
    message = "请求处理失败，请稍后重试。",
    public readonly statusCode = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "请求参数不正确。") {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationError";
  }
}

export class InvalidInputError extends AppError {
  constructor(message = "请求参数不正确。") {
    super("INVALID_INPUT", message, 400);
    this.name = "InvalidInputError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "请先登录后再继续。") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "当前账号没有权限访问该资源。") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class LicenseRequiredError extends AppError {
  constructor(message = "请先输入卡密激活知识库。") {
    super("LICENSE_REQUIRED", message, 403);
    this.name = "LicenseRequiredError";
  }
}

export class LicenseNotFoundError extends AppError {
  constructor(message = "卡密不存在或无效。") {
    super("LICENSE_NOT_FOUND", message, 404);
    this.name = "LicenseNotFoundError";
  }
}

export class InvalidLicenseKeyError extends AppError {
  constructor(message = "卡密格式无效。") {
    super("INVALID_LICENSE_KEY", message, 400);
    this.name = "InvalidLicenseKeyError";
  }
}

export class LicenseAppTypeMismatchError extends AppError {
  constructor(message = "卡密不适用于当前客户端。") {
    super("LICENSE_APP_TYPE_MISMATCH", message, 403);
    this.name = "LicenseAppTypeMismatchError";
  }
}

export class LicenseDisabledError extends AppError {
  constructor(message = "卡密已禁用。") {
    super("LICENSE_DISABLED", message, 403);
    this.name = "LicenseDisabledError";
  }
}

export class LicenseExpiredError extends AppError {
  constructor(message = "卡密已过期。") {
    super("LICENSE_EXPIRED", message, 403);
    this.name = "LicenseExpiredError";
  }
}

export class LicenseActivationLimitReachedError extends AppError {
  constructor(message = "卡密激活次数已达上限。") {
    super("LICENSE_ACTIVATION_LIMIT_REACHED", message, 403);
    this.name = "LicenseActivationLimitReachedError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "请求的资源不存在。") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class AIError extends AppError {
  constructor(message = "AI 服务暂时不可用，请稍后重试。") {
    super("AI_ERROR", message, 502);
    this.name = "AIError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "请求过于频繁，请稍后再试。") {
    super("RATE_LIMITED", message, 429);
    this.name = "RateLimitError";
  }
}

export class ConfigError extends AppError {
  constructor(message = "系统配置未完成，请联系管理员。") {
    super("CONFIG_ERROR", message, 500);
    this.name = "ConfigError";
  }
}

const appErrorCodes = new Set<AppErrorCode>([
  "APP_ERROR",
  "UNKNOWN_ERROR",
  "VALIDATION_ERROR",
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "FEATURE_DISABLED",
  "NOT_FOUND",
  "NOT_IMPLEMENTED",
  "AI_ERROR",
  "MISSING_AI_API_KEY",
  "MISSING_QWEN_API_KEY",
  "MISSING_EMBEDDING_API_KEY",
  "AI_RATE_LIMITED",
  "AI_QUOTA_EXCEEDED",
  "AI_PROVIDER_FAILED",
  "QWEN_REQUEST_FAILED",
  "OPENAI_REQUEST_FAILED",
  "DEEPSEEK_REQUEST_FAILED",
  "AI_REQUEST_FAILED",
  "EMBEDDING_FAILED",
  "VECTOR_SEARCH_FAILED",
  "DATABASE_ERROR",
  "MISSING_DATABASE_URL",
  "INVALID_DATABASE_URL",
  "DATABASE_CONNECTION_FAILED",
  "DATABASE_SCHEMA_MISSING",
  "INGEST_WRITE_FAILED",
  "CONFIG_ERROR",
  "LICENSE_REQUIRED",
  "LICENSE_NOT_FOUND",
  "INVALID_LICENSE_KEY",
  "LICENSE_APP_TYPE_MISMATCH",
  "LICENSE_DISABLED",
  "LICENSE_EXPIRED",
  "LICENSE_ACTIVATION_LIMIT_REACHED",
  "RATE_LIMITED"
]);

function isAppErrorLike(error: unknown): error is {
  code: AppErrorCode;
  message: string;
  statusCode: number;
} {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };

  return (
    typeof value.code === "string" &&
    appErrorCodes.has(value.code as AppErrorCode) &&
    typeof value.message === "string" &&
    typeof value.statusCode === "number"
  );
}

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (isAppErrorLike(error)) {
    return new AppError(error.code, error.message, error.statusCode);
  }

  if (error && typeof error === "object") {
    const value = error as {
      code?: unknown;
      message?: unknown;
    };
    const code = typeof value.code === "string" ? value.code : "";
    const message = typeof value.message === "string" ? value.message : "";

    if (["P1000", "P1001", "P1017", "P2024"].includes(code)) {
      return new AppError("DATABASE_CONNECTION_FAILED", "数据库连接失败，请检查 DATABASE_URL 是否为 Supabase Pooler 完整连接串。", 500);
    }

    if (["P2021", "P2022"].includes(code) || /relation .* does not exist|column .* does not exist/i.test(message)) {
      return new AppError("DATABASE_SCHEMA_MISSING", "数据库表结构未就绪，请执行 pnpm prisma:migrate:deploy。", 500);
    }
  }

  return new AppError("UNKNOWN_ERROR", "请求处理失败，请稍后重试。", 500);
}
