import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { hasDatabaseUrl } from "@/lib/server-config";
import { requireTeamOsAccess } from "@/apps/team-os/features/auth/services/team-os-access";
import {
  getCrmOperationsDashboardForUser,
  createCrmConversationForUser,
  createCrmIntegrationForUser,
  createCrmSalesTargetForUser,
  createCrmVisitForUser,
  inspectCrmConversationForUser,
  listCrmConversationsForUser,
  listCrmDailyPlansForUser,
  listCrmIntegrationsForUser,
  listCrmSalesTargetsForUser,
  listCrmVisitsForUser,
  updateCrmVisitStatusForUser,
  upsertCrmDailyPlanForUser
} from "@/apps/team-os/features/crm/operations/repository";
import {
  parseCreateConversationInput,
  parseCreateDailyPlanInput,
  parseCreateIntegrationInput,
  parseCreateSalesTargetInput,
  parseCreateVisitInput,
  parseOperationId,
  parseOperationsListInput,
  parseUpdateVisitStatusInput
} from "@/apps/team-os/features/crm/operations/input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";
import { teamOsProductionLogger } from "@/apps/team-os/features/production/services/production-logger";

const apiError = createTeamOsApiErrorHandler("CRM");

function logOperation(
  request: Request,
  user: {
    id: string;
    companyId: string;
    teamId: string;
  },
  operation: string,
  metadata: Record<string, unknown> = {}
) {
  teamOsProductionLogger.info("crm_operation", {
    module: "CRM",
    requestId: getRequestIdFromHeaders(request.headers),
    userId: user.id,
    companyId: user.companyId,
    teamId: user.teamId
  }, {
    operation,
    ...metadata
  });
}

export async function handleCrmOperationsDashboardGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 运营看板"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await getCrmOperationsDashboardForUser(user.id, input);
    logOperation(request, user, "operations_dashboard_read", { selectedTeamId: result.scope.teamId });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmConversationsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 沟通记录"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await listCrmConversationsForUser(user.id, input);
    logOperation(request, user, "conversations_read", {
      selectedTeamId: result.scope.teamId,
      itemCount: result.items.length
    });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmConversationCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存 CRM 沟通记录"));
    const input = parseCreateConversationInput(await readJson(request));
    const result = await createCrmConversationForUser(user.id, input);
    logOperation(request, user, "conversation_created", {
      conversationId: result.id,
      customerId: result.customerId,
      channel: result.channel
    });
    return apiSuccess({ conversation: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmConversationInspect(
  request: Request,
  conversationId: string
) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("执行 CRM 沟通质检"));
    const result = await inspectCrmConversationForUser(
      user.id,
      parseOperationId(conversationId, "沟通记录 ID")
    );
    logOperation(request, user, "conversation_inspected", {
      conversationId: result.conversationId,
      inspectionId: result.id,
      score: result.score
    });
    return apiSuccess({ inspection: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmDailyPlansGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 每日计划"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await listCrmDailyPlansForUser(user.id, input);
    logOperation(request, user, "daily_plans_read", {
      selectedTeamId: result.scope.teamId,
      itemCount: result.items.length
    });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmDailyPlanUpsert(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存 CRM 每日计划"));
    const input = parseCreateDailyPlanInput(await readJson(request));
    const result = await upsertCrmDailyPlanForUser(user.id, input);
    logOperation(request, user, "daily_plan_saved", {
      dailyPlanId: result.id,
      status: result.status
    });
    return apiSuccess({ dailyPlan: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmTargetsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 销售目标"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await listCrmSalesTargetsForUser(user.id, input);
    logOperation(request, user, "sales_targets_read", {
      selectedTeamId: result.scope.teamId,
      itemCount: result.items.length
    });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmTargetCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("创建 CRM 销售目标"));
    const input = parseCreateSalesTargetInput(await readJson(request));
    const result = await createCrmSalesTargetForUser(user.id, input);
    logOperation(request, user, "sales_target_created", {
      targetId: result.id,
      metric: result.metric
    });
    return apiSuccess({ target: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmIntegrationsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 集成来源"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await listCrmIntegrationsForUser(user.id, input);
    logOperation(request, user, "integrations_read", {
      selectedTeamId: result.scope.teamId,
      itemCount: result.items.length
    });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmIntegrationCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存 CRM 集成来源"));
    const input = parseCreateIntegrationInput(await readJson(request));
    const result = await createCrmIntegrationForUser(user.id, input);
    logOperation(request, user, "integration_created", {
      integrationId: result.id,
      channel: result.channel
    });
    return apiSuccess({ integration: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmVisitsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 拜访计划"));
    const input = parseOperationsListInput(new URL(request.url).searchParams);
    const result = await listCrmVisitsForUser(user.id, input);
    logOperation(request, user, "visits_read", {
      selectedTeamId: result.scope.teamId,
      itemCount: result.items.length
    });
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmVisitCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("创建 CRM 拜访计划"));
    const input = parseCreateVisitInput(await readJson(request));
    const result = await createCrmVisitForUser(user.id, input);
    logOperation(request, user, "visit_created", {
      visitId: result.id,
      customerId: result.customerId
    });
    return apiSuccess({ visit: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmVisitStatusUpdate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "crm");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("更新 CRM 拜访状态"));
    const input = parseUpdateVisitStatusInput(await readJson(request));
    const result = await updateCrmVisitStatusForUser(user.id, input);
    logOperation(request, user, "visit_status_updated", {
      visitId: result.id,
      status: result.status
    });
    return apiSuccess({ visit: result });
  } catch (error) {
    return apiError(error);
  }
}
