import { ValidationError } from "@/lib/errors";
import type { ExpertCatalogStatus } from "@/types/super-admin-expert-catalog";

export const PROTECTED_EXPERT_BINDINGS = Object.freeze({
  "expert-health": Object.freeze({
    knowledgeBaseId: "kb-health-expert",
    namespace: "kb-health-expert"
  }),
  "expert-career": Object.freeze({
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach"
  }),
  "expert-slim-kks": Object.freeze({
    knowledgeBaseId: "kb-kks-slim",
    namespace: "kb-kks-slim"
  })
});

export const EXPERT_CATALOG_STATUSES: ExpertCatalogStatus[] = [
  "active",
  "hidden",
  "archived"
];

const IMMUTABLE_AGENT_FIELDS = new Set([
  "agentKey",
  "knowledgeBaseId",
  "namespace",
  "protectedBinding"
]);

export function cleanCatalogText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeCatalogAliases(values: unknown, currentName?: string): string[] {
  const items = Array.isArray(values) ? values : [];
  const aliases = [...items, currentName]
    .map((item) => cleanCatalogText(item, 120))
    .filter(Boolean);

  return Array.from(new Set(aliases));
}

export function parseCatalogStatus(value: unknown): ExpertCatalogStatus {
  const status = cleanCatalogText(value, 20) as ExpertCatalogStatus;

  if (!EXPERT_CATALOG_STATUSES.includes(status)) {
    throw new ValidationError("目录状态无效。");
  }

  return status;
}

export function assertValidKnowledgeBaseId(value: unknown): string {
  const knowledgeBaseId = cleanCatalogText(value, 100).toLowerCase();

  if (!/^kb-[a-z0-9][a-z0-9-]{2,79}$/.test(knowledgeBaseId)) {
    throw new ValidationError("知识库标识必须使用 kb- 开头的小写字母、数字或短横线。");
  }

  return knowledgeBaseId;
}

export function assertAgentUpdateDoesNotChangeBinding(input: Record<string, unknown>) {
  const immutableField = Object.keys(input).find((key) => IMMUTABLE_AGENT_FIELDS.has(key));

  if (immutableField) {
    throw new ValidationError(`字段 ${immutableField} 是固定知识库绑定，不允许修改。`);
  }
}

export function isProtectedExpertAgent(agentKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROTECTED_EXPERT_BINDINGS, agentKey);
}

export function getProtectedExpertBinding(agentKey: string) {
  return PROTECTED_EXPERT_BINDINGS[agentKey as keyof typeof PROTECTED_EXPERT_BINDINGS] ?? null;
}

export function createAgentKey(displayName: string, uniqueSuffix: string): string {
  const readable = displayName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const base = readable || "custom";

  return `expert-${base}-${uniqueSuffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
}
