import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/lib/api-response";
import { toAppError } from "@/lib/errors";
import { createRequestId, REQUEST_ID_HEADER } from "@/lib/logger";
import {
  teamOsProductionLogger,
  toTeamOsSafeErrorMetadata,
  type TeamOsProductionLogContext,
  type TeamOsProductionModule
} from "@/apps/team-os/features/production/services/production-logger";

export type TeamOsErrorReport = {
  errorId: string;
  timestamp: string;
  module: TeamOsProductionModule;
  requestId: string | null;
  userId: string | null;
  companyId: string | null;
  code: string;
  statusCode: number;
};

export const TEAM_OS_ERROR_ID_HEADER = "x-team-os-error-id";

function currentRequestId() {
  try {
    return headers().get(REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}

async function currentAuditIdentity() {
  try {
    const [{ getCurrentUser }, { prisma }] = await Promise.all([
      import("@/lib/auth/session"),
      import("@/lib/prisma")
    ]);
    const user = await getCurrentUser();
    const companies = await prisma.teamOrganization.findMany({
      where: {
        status: "ACTIVE",
        members: { some: { userId: user.id, status: "ACTIVE" } }
      },
      select: { companyId: true },
      distinct: ["companyId"],
      take: 2
    });
    return {
      userId: user.id,
      companyId: companies.length === 1 ? companies[0].companyId : null
    };
  } catch {
    return { userId: null, companyId: null };
  }
}

export function createTeamOsErrorReport(
  error: unknown,
  context: TeamOsProductionLogContext
): TeamOsErrorReport {
  const appError = toAppError(error);
  return {
    errorId: `tos_${createRequestId()}`,
    timestamp: new Date().toISOString(),
    module: context.module,
    requestId: context.requestId ?? null,
    userId: context.userId ?? null,
    companyId: context.companyId ?? null,
    code: appError.code,
    statusCode: appError.statusCode
  };
}

export function captureTeamOsError(
  error: unknown,
  context: TeamOsProductionLogContext
) {
  const report = createTeamOsErrorReport(error, context);
  const level = report.statusCode >= 500 ? "error" : "warn";
  const event = report.statusCode === 401 || report.statusCode === 403
    ? "permission_denied"
    : "api_error";
  teamOsProductionLogger[level](event, context, {
    errorId: report.errorId,
    errorTimestamp: report.timestamp,
    code: report.code,
    statusCode: report.statusCode,
    error: toTeamOsSafeErrorMetadata(error)
  });
  return report;
}

export function createTeamOsApiErrorHandler(module: TeamOsProductionModule) {
  return async (error: unknown, init?: ResponseInit) => {
    const requestId = currentRequestId();
    const identity = await currentAuditIdentity();
    const report = captureTeamOsError(error, {
      module,
      requestId,
      ...identity
    });
    const appError = toAppError(error);
    const responseHeaders = new Headers(init?.headers);
    responseHeaders.set(TEAM_OS_ERROR_ID_HEADER, report.errorId);
    if (requestId) responseHeaders.set(REQUEST_ID_HEADER, requestId);

    const responseRequestId = requestId ?? undefined;
    return NextResponse.json<ApiErrorResponse>({
      ok: false,
      code: appError.code,
      message: appError.message,
      requestId: responseRequestId,
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        requestId: responseRequestId
      }
    }, {
      ...init,
      headers: responseHeaders,
      status: appError.statusCode
    });
  };
}
