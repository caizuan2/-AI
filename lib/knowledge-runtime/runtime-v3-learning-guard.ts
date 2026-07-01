import type {
  RuntimeV3LearningScope,
  RuntimeV3ScriptVariant,
} from "./runtime-v3-sales-learning-types";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildRuntimeV3ScopeKey(scope: RuntimeV3LearningScope) {
  const kb = cleanText(scope.knowledgeBaseId) || cleanText(scope.kbId) || "kb:unknown";
  const agent = cleanText(scope.agentId) || cleanText(scope.expertId) || "agent:unknown";
  const tenant = cleanText(scope.tenantId) || "tenant:default";
  const namespace = cleanText(scope.namespace) || "namespace:default";

  return [tenant, namespace, kb, agent].join("::");
}

export function normalizeRuntimeV3Scope(scope: RuntimeV3LearningScope): RuntimeV3LearningScope {
  return {
    knowledgeBaseId: cleanText(scope.knowledgeBaseId) || null,
    kbId: cleanText(scope.kbId) || cleanText(scope.knowledgeBaseId) || null,
    agentId: cleanText(scope.agentId) || cleanText(scope.expertId) || null,
    expertId: cleanText(scope.expertId) || cleanText(scope.agentId) || null,
    tenantId: cleanText(scope.tenantId) || null,
    namespace: cleanText(scope.namespace) || null,
  };
}

export function assertRuntimeV3LearningSafe(input: {
  scope: RuntimeV3LearningScope;
  messages?: string[];
  variants?: RuntimeV3ScriptVariant[];
  complianceWarnings?: string[];
}) {
  const scope = normalizeRuntimeV3Scope(input.scope);
  const warnings = new Set<string>();

  if (!scope.kbId && !scope.knowledgeBaseId) {
    warnings.add("缺少知识库范围，本轮只输出建议，不启用跨轮学习。");
  }

  if (!scope.agentId && !scope.expertId) {
    warnings.add("缺少 Agent 范围，本轮只输出建议，不启用跨 Agent 学习。");
  }

  for (const warning of input.complianceWarnings ?? []) {
    if (warning) warnings.add(warning);
  }

  const unsafeEffectWords = /(保证|必瘦|一定有效|包治|治愈|永久|无副作用)/;
  for (const variant of input.variants ?? []) {
    if (unsafeEffectWords.test(variant.message)) {
      warnings.add("已拦截夸大效果表达，健康/控体场景只能做真实预期管理。");
    }
  }

  return {
    ok: true,
    scope,
    scopeKey: buildRuntimeV3ScopeKey(scope),
    warnings: Array.from(warnings),
    learningEnabled: Boolean((scope.kbId || scope.knowledgeBaseId) && (scope.agentId || scope.expertId)),
  };
}
