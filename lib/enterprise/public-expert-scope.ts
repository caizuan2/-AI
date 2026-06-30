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
    aliases: ["expert-health", "kb-health-expert"],
    knowledgeBaseId: "kb-health-expert",
    agentId: "expert-health"
  },
  {
    aliases: ["expert-career", "kb-career-mentor"],
    knowledgeBaseId: "kb-career-mentor",
    agentId: "expert-career"
  },
  {
    aliases: ["expert-slim-kks", "expert-kks", "kb-kks-slim"],
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

  const seed = PUBLIC_EXPERT_SCOPE_SEEDS.find((item) =>
    keys.some((key) => item.aliases.some((alias) => key === alias.toLowerCase()))
  );

  return seed ? toScope(seed, clean(input.tenantId)) : null;
}

export function publicExpertScopeAliasesFor(value: unknown): string[] {
  const key = normalize(value);

  if (!key) {
    return [];
  }

  const seed = PUBLIC_EXPERT_SCOPE_SEEDS.find((item) =>
    item.aliases.some((alias) => alias.toLowerCase() === key)
  );

  return seed ? seed.aliases : [key];
}
