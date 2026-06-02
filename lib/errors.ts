export type AppErrorCode =
  | "APP_ERROR"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "AI_ERROR"
  | "DATABASE_ERROR"
  | "CONFIG_ERROR"
  | "LICENSE_REQUIRED"
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

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError();
}
