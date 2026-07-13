import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import { getCopilotAgent } from "@/apps/team-os/features/copilot/agents";
import { resolveCopilotAccess } from "@/apps/team-os/features/copilot/services/copilot-access";
import { generateCopilotAnswer } from "@/apps/team-os/features/copilot/services/copilot-ai-provider";
import { notifyNewCopilotInsights } from "@/apps/team-os/features/copilot/services/copilot-notifications";
import {
  getCopilotConversation,
  listCopilotInsights,
  persistCopilotInsights,
  saveCopilotConversation
} from "@/apps/team-os/features/copilot/services/copilot-repository";
import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";
import {
  parseCopilotChatInput,
  parseCopilotInsightSyncInput,
  parseCopilotInsightsQuery,
  parseCopilotQuery
} from "@/apps/team-os/features/copilot/utils/copilot-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson } from "@/apps/team-os/features/production/services/production-http";

const MAX_BODY_BYTES = 16 * 1024;
const apiError = createTeamOsApiErrorHandler("COPILOT");

async function readJson(request: Request) {
  return readTeamOsJson(request, { maxBytes: MAX_BODY_BYTES });
}

function query(request: Request) {
  return new URL(request.url).searchParams;
}

export async function handleCopilotDashboardGet(
  request: Request,
  assistantRole: CopilotAssistantRole
) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业助手数据"));
    const input = parseCopilotQuery(query(request));
    const scope = await resolveCopilotAccess(user.id, assistantRole, input.companyId);
    return apiSuccess(await getCopilotAgent(assistantRole).buildDashboard(scope));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCopilotChatPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("使用企业助手对话"));
    const input = parseCopilotChatInput(await readJson(request));
    const scope = await resolveCopilotAccess(user.id, input.assistantRole, input.companyId);
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-copilot-chat",
      userId: user.id,
      limit: 20,
      globalLimit: 400,
      windowMs: 15 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError(`AI 助手请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`);
    }
    const agent = getCopilotAgent(input.assistantRole);
    const [dashboard, history] = await Promise.all([
      agent.buildDashboard(scope),
      getCopilotConversation(scope)
    ]);
    const generated = await generateCopilotAnswer({
      agent,
      dashboard,
      history: history.conversation,
      message: input.message,
      requestId: getRequestIdFromHeaders(request.headers)
    });
    const session = await saveCopilotConversation({
      companyId: scope.context.companyId,
      userId: user.id,
      role: input.assistantRole,
      userMessage: input.message,
      assistantMessage: generated.answer
    });
    return apiSuccess({
      sessionId: session.id,
      assistantRole: input.assistantRole,
      answer: generated.answer,
      provider: generated.provider,
      fallbackUsed: generated.fallbackUsed,
      conversation: session.conversation
    }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCopilotInsightsGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 AI 洞察"));
    const input = parseCopilotInsightsQuery(query(request));
    const scope = await resolveCopilotAccess(user.id, input.assistantRole, input.companyId);
    return apiSuccess({
      context: scope.context,
      items: await listCopilotInsights(scope),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCopilotInsightsPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("生成 AI 洞察"));
    const input = parseCopilotInsightSyncInput(await readJson(request));
    const scope = await resolveCopilotAccess(user.id, input.assistantRole, input.companyId);
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-copilot-insight-sync",
      userId: user.id,
      limit: 8,
      globalLimit: 300,
      windowMs: 10 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError(`洞察同步过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`);
    }
    const dashboard = await getCopilotAgent(input.assistantRole).buildDashboard(scope);
    const persisted = await persistCopilotInsights(scope, dashboard.insights);
    const notificationCount = await notifyNewCopilotInsights({
      scope,
      candidates: dashboard.insights,
      records: persisted.records
    });
    return apiSuccess({
      context: scope.context,
      createdInsightCount: persisted.createdInsightCount,
      createdRecommendationCount: persisted.createdRecommendationCount,
      notificationCount,
      items: persisted.records
    }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}
