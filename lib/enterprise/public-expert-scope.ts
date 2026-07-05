export type PublicExpertScope = {
  knowledgeBaseId: string;
  kbId: string;
  agentId: string;
  expertId: string;
  namespace: string;
  tenantId: string;
};

type PublicExpertScopeSeed = {
  aliases: string[];
  knowledgeBaseId: string;
  agentId: string;
};

const PUBLIC_EXPERT_SCOPE_SEEDS: PublicExpertScopeSeed[] = [
  {
    aliases: ["expert-health", "kb-health-expert", "大健康专家", "大健康", "health-expert"],
    knowledgeBaseId: "kb-health-expert",
    agentId: "expert-health"
  },
  {
    aliases: [
      "expert-career",
      "expert-business",
      "kb-business-coach",
      "kb-career-mentor",
      "讲事业导师",
      "事业导师",
      "business-coach",
      "career-mentor"
    ],
    knowledgeBaseId: "kb-business-coach",
    agentId: "expert-career"
  },
  {
    aliases: [
      "expert-slim-kks",
      "expert-kks",
      "kb-kks-slim",
      "expert-agent-expert-slim-kks",
      "agent-expert-slim-kks",
      "kb:expert-agent-expert-slim-kks",
      "agent:expert-agent-expert-slim-kks:kb:kb:expert-agent-expert-slim-kks",
      "瘦身kks专业师",
      "瘦身KKS专业师",
      "kks",
      "slim-kks"
    ],
    knowledgeBaseId: "kb-kks-slim",
    agentId: "expert-kks"
  },
  {
    aliases: ["expert-sansheng-china", "kb-sansheng-china"],
    knowledgeBaseId: "kb-sansheng-china",
    agentId: "expert-sansheng-china"
  },
  {
    aliases: ["expert-sansheng-assets", "kb-sansheng-assets"],
    knowledgeBaseId: "kb-sansheng-assets",
    agentId: "expert-sansheng-assets"
  },
  {
    aliases: ["expert-market-assets", "kb-market-assets"],
    knowledgeBaseId: "kb-market-assets",
    agentId: "expert-market-assets"
  },
  {
    aliases: ["expert-seed-camp", "kb-seed-camp"],
    knowledgeBaseId: "kb-seed-camp",
    agentId: "expert-seed-camp"
  },
  {
    aliases: ["expert-leader-road", "kb-leader-road"],
    knowledgeBaseId: "kb-leader-road",
    agentId: "expert-leader-road"
  },
  {
    aliases: ["expert-army", "kb-army-growth"],
    knowledgeBaseId: "kb-army-growth",
    agentId: "expert-army"
  }
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase();
}

function toScope(seed: PublicExpertScopeSeed, tenantId?: string | null): PublicExpertScope {
  const resolvedTenantId = clean(tenantId) || "default";

  return {
    knowledgeBaseId: seed.knowledgeBaseId,
    kbId: seed.knowledgeBaseId,
    agentId: seed.agentId,
    expertId: seed.agentId,
    namespace: seed.knowledgeBaseId,
    tenantId: resolvedTenantId
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function deriveExpertIdFromKey(value: string): string {
  const key = normalize(value)
    .replace(/^kb:/, "")
    .replace(/^agent:/, "")
    .split(":")[0];

  if (!key) {
    return "";
  }

  if (key.startsWith("expert-agent-expert-")) {
    return `expert-${key.slice("expert-agent-expert-".length)}`;
  }

  if (key.startsWith("agent-expert-")) {
    return key.slice("agent-".length);
  }

  if (key.startsWith("expert-")) {
    return key;
  }

  if (key.startsWith("kb-")) {
    return `expert-${key.slice("kb-".length)}`;
  }

  return "";
}

function buildGenericExpertScopeSeed(expertId: string): PublicExpertScopeSeed | null {
  const normalizedExpertId = deriveExpertIdFromKey(expertId);

  if (!normalizedExpertId) {
    return null;
  }

  const slug = normalizedExpertId.replace(/^expert-/, "");
  const knowledgeBaseId = `kb-${slug}`;

  return {
    aliases: dedupe([
      normalizedExpertId,
      knowledgeBaseId,
      `expert-agent-${normalizedExpertId}`,
      `agent-${normalizedExpertId}`,
      `kb:${normalizedExpertId}`,
      `agent:${normalizedExpertId}:kb:${knowledgeBaseId}`,
      `agent:expert-agent-${normalizedExpertId}:kb:${knowledgeBaseId}`
    ]),
    knowledgeBaseId,
    agentId: normalizedExpertId
  };
}

function findSeedForKeys(keys: string[]): PublicExpertScopeSeed | null {
  const explicitSeed = PUBLIC_EXPERT_SCOPE_SEEDS.find((item) =>
    keys.some((key) => item.aliases.some((alias) => key === alias.toLowerCase()))
  );

  if (explicitSeed) {
    return explicitSeed;
  }

  for (const key of keys) {
    const genericSeed = buildGenericExpertScopeSeed(key);

    if (genericSeed) {
      return genericSeed;
    }
  }

  return null;
}

export function resolvePublicExpertScope(input: {
  agentId?: unknown;
  expertId?: unknown;
  knowledgeBaseId?: unknown;
  kbId?: unknown;
  namespace?: unknown;
  tenantId?: unknown;
}): PublicExpertScope | null {
  const keys = [
    input.agentId,
    input.expertId,
    input.knowledgeBaseId,
    input.kbId,
    input.namespace
  ].map(normalize).filter(Boolean);

  if (keys.length === 0) {
    return null;
  }

  const seed = findSeedForKeys(keys);

  return seed ? toScope(seed, clean(input.tenantId)) : null;
}

export function publicExpertScopeAliasesFor(value: unknown): string[] {
  const key = normalize(value);

  if (!key) {
    return [];
  }

  const seed = findSeedForKeys([key]);

  return seed ? seed.aliases : [key];
}

export function publicExpertScopeValuesOverlap(left: unknown, right: unknown): boolean {
  const leftAliases = publicExpertScopeAliasesFor(left).map(normalize).filter(Boolean);
  const rightAliases = publicExpertScopeAliasesFor(right).map(normalize).filter(Boolean);

  if (leftAliases.length === 0 || rightAliases.length === 0) {
    return false;
  }

  const rightSet = new Set(rightAliases);
  return leftAliases.some((alias) => rightSet.has(alias));
}
