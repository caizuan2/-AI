import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/errors";

export type TeamOsProductionModule =
  | "AUTH"
  | "API"
  | "AI"
  | "WORKFLOW"
  | "CRM"
  | "KNOWLEDGE"
  | "ORGANIZATION"
  | "TASKS"
  | "TRAINING"
  | "ANALYTICS"
  | "TENANT"
  | "NOTIFICATION"
  | "AI_BRAIN"
  | "COPILOT"
  | "INDUSTRY_COACH"
  | "PRODUCTION";

export type TeamOsProductionEvent =
  | "login"
  | "permission_denied"
  | "ai_call"
  | "workflow_execution"
  | "crm_operation"
  | "knowledge_call"
  | "api_error"
  | "release_check";

export type TeamOsProductionLogContext = {
  module: TeamOsProductionModule;
  requestId?: string | null;
  userId?: string | null;
  companyId?: string | null;
  teamId?: string | null;
};

type Metadata = Record<string, unknown>;

export function toTeamOsSafeErrorMetadata(error: unknown) {
  const appError = toAppError(error);
  const candidateName = error instanceof Error ? error.name : "UnknownError";
  const errorName = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidateName)
    ? candidateName
    : "UnknownError";

  return {
    errorName,
    code: appError.code,
    statusCode: appError.statusCode
  };
}

function payload(context: TeamOsProductionLogContext, metadata: Metadata = {}) {
  return {
    ...metadata,
    module: context.module,
    requestId: context.requestId ?? null,
    userId: context.userId ?? null,
    companyId: context.companyId ?? null,
    teamId: context.teamId ?? null
  };
}

function eventName(event: TeamOsProductionEvent) {
  return `team_os.production.${event}`;
}

export const teamOsProductionLogger = {
  info(event: TeamOsProductionEvent, context: TeamOsProductionLogContext, metadata?: Metadata) {
    logger.info(eventName(event), payload(context, metadata));
  },
  warn(event: TeamOsProductionEvent, context: TeamOsProductionLogContext, metadata?: Metadata) {
    logger.warn(eventName(event), payload(context, metadata));
  },
  error(event: TeamOsProductionEvent, context: TeamOsProductionLogContext, metadata?: Metadata) {
    logger.error(eventName(event), payload(context, metadata));
  }
};
