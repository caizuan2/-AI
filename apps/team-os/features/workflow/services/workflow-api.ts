import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  assertCanCreateWorkflow,
  assertCanExecuteWorkflowActions,
  assertCanExecuteWorkflow,
  assertCanViewWorkflow,
  resolveWorkflowAccess
} from "@/apps/team-os/features/workflow/services/workflow-access";
import {
  assertWorkflowTrainingCoursesAvailable,
  createWorkflowDefinition,
  getWorkflowDefinitionForExecution,
  listWorkflowDefinitions,
  listWorkflowExecutions
} from "@/apps/team-os/features/workflow/services/workflow-repository";
import { executeWorkflow } from "@/apps/team-os/features/workflow/engine/workflow-engine";
import { hydrateWorkflowEvent } from "@/apps/team-os/features/workflow/triggers/workflow-event-context";
import {
  parseCreateWorkflowInput,
  parseExecuteWorkflowInput,
  parseWorkflowExecutionQuery,
  parseWorkflowListQuery
} from "@/apps/team-os/features/workflow/utils/workflow-input";
import type { WorkflowExecutionMode } from "@/apps/team-os/features/workflow/types";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson } from "@/apps/team-os/features/production/services/production-http";

const MAX_BODY_BYTES = 32 * 1024;
const apiError = createTeamOsApiErrorHandler("WORKFLOW");

async function readJson(request: Request) {
  return readTeamOsJson(request, { maxBytes: MAX_BODY_BYTES });
}

function searchParams(request: Request) {
  return new URL(request.url).searchParams;
}

export async function handleWorkflowListGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业工作流"));
    const input = parseWorkflowListQuery(searchParams(request));
    const access = await resolveWorkflowAccess(user.id, input.companyId);
    assertCanViewWorkflow(access);
    return apiSuccess(await listWorkflowDefinitions(access));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleWorkflowCreatePost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("创建企业工作流"));
    const input = parseCreateWorkflowInput(await readJson(request));
    const access = await resolveWorkflowAccess(user.id, input.companyId);
    assertCanCreateWorkflow(
      access,
      input.scopeTeamId,
      input.actions.map((action) => action.actionType),
      input.eventType
    );
    await assertWorkflowTrainingCoursesAvailable(access, input);
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-workflow-create",
      userId: user.id,
      limit: 10,
      globalLimit: 200,
      windowMs: 10 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError(`创建工作流过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`);
    }
    const created = await createWorkflowDefinition(access, input);
    return apiSuccess(created, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleWorkflowExecutionsGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取工作流执行记录"));
    const input = parseWorkflowExecutionQuery(searchParams(request));
    const access = await resolveWorkflowAccess(user.id, input.companyId);
    assertCanViewWorkflow(access);
    return apiSuccess(await listWorkflowExecutions(access, input.limit));
  } catch (error) {
    return apiError(error);
  }
}

async function handleExecution(request: Request, mode: WorkflowExecutionMode) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError(mode === "TEST" ? "测试工作流" : "执行工作流"));
    const input = parseExecuteWorkflowInput(await readJson(request));
    const access = await resolveWorkflowAccess(user.id, input.companyId);
    const workflow = await getWorkflowDefinitionForExecution(access, input.workflowId);
    assertCanExecuteWorkflow(access, {
      companyId: workflow.companyId,
      teamId: workflow.scopeTeamId ?? null,
      eventType: workflow.eventType
    });
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: mode === "TEST" ? "team-os-workflow-test" : "team-os-workflow-execute",
      userId: user.id,
      limit: mode === "TEST" ? 20 : 10,
      globalLimit: mode === "TEST" ? 400 : 200,
      windowMs: mode === "TEST" ? 10 * 60 * 1_000 : 5 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError(`工作流请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`);
    }
    if (
      mode === "PRODUCTION" &&
      workflow.actions.some((action) => action.actionType === "GENERATE_REPORT")
    ) {
      const reportRateLimit = await checkPersistentRateLimit(request, {
        namespace: "team-os-workflow-report",
        userId: user.id,
        limit: 6,
        globalLimit: 120,
        windowMs: 10 * 60 * 1_000
      });
      if (!reportRateLimit.allowed) {
        throw new RateLimitError(`生成经营报告过于频繁，请 ${reportRateLimit.retryAfterSeconds} 秒后再试。`);
      }
    }
    const event = await hydrateWorkflowEvent({
      workflow,
      event: input.event,
      actorUserId: user.id
    });
    assertCanExecuteWorkflowActions(access, {
      teamId: event.teamId,
      actionTypes: workflow.actions.map((action) => action.actionType)
    });
    const execution = await executeWorkflow({
      workflow,
      event,
      mode,
      triggeredBy: user.id,
      requestId: getRequestIdFromHeaders(request.headers)
    });
    return apiSuccess(execution, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}

export function handleWorkflowExecutePost(request: Request) {
  return handleExecution(request, "PRODUCTION");
}

export function handleWorkflowTestPost(request: Request) {
  return handleExecution(request, "TEST");
}
