import {
  ingestExperts,
  ingestExpertZones,
  type IngestExpert,
  type IngestExpertZone
} from "@/lib/enterprise/mock-experts";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";

type PublicCatalogZone = {
  zoneKey?: unknown;
  displayName?: unknown;
  sortOrder?: unknown;
};

type PublicCatalogAgent = {
  agentKey?: unknown;
  displayName?: unknown;
  knowledgeBaseId?: unknown;
  namespace?: unknown;
  zoneKey?: unknown;
  sortOrder?: unknown;
  aliases?: unknown;
  avatar?: unknown;
  description?: unknown;
};

type PublicCatalogEnvelope = {
  ok?: boolean;
  success?: boolean;
  data?: {
    zones?: PublicCatalogZone[];
    agents?: PublicCatalogAgent[];
  };
};

export type IngestExpertCatalogSnapshot = {
  zones: IngestExpertZone[];
  experts: IngestExpert[];
  source: "remote" | "fallback";
};

const zoneAccents = [
  "from-[#dff8e8] via-white to-[#eef5ff]",
  "from-[#fff3d6] via-white to-[#f5f0ff]",
  "from-[#ffe8ea] via-white to-[#edf7ff]"
];

const fallbackSnapshot: IngestExpertCatalogSnapshot = {
  zones: ingestExpertZones,
  experts: ingestExperts,
  source: "fallback"
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanSortOrder(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanAliases(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(cleanText).filter(Boolean)))
    : [];
}

function fallbackExpert(agentKey: string) {
  return ingestExperts.find((expert) => expert.id === agentKey);
}

function resolveCatalogBinding(agent: PublicCatalogAgent, expert: IngestExpert | undefined) {
  const catalogKnowledgeBaseId = cleanText(agent.knowledgeBaseId);
  const catalogNamespace = cleanText(agent.namespace);

  if (expert) {
    const fixedScope = resolvePublicExpertScope({
      agentId: expert.id,
      expertId: expert.id
    });

    return {
      knowledgeBaseId: fixedScope?.knowledgeBaseId ?? catalogKnowledgeBaseId,
      namespace: fixedScope?.namespace ?? catalogNamespace
    };
  }

  return {
    knowledgeBaseId: catalogKnowledgeBaseId,
    namespace: catalogNamespace
  };
}

export function mapPublicExpertCatalog(payload: unknown): IngestExpertCatalogSnapshot {
  const envelope = payload as PublicCatalogEnvelope;
  const rawZones = Array.isArray(envelope?.data?.zones) ? envelope.data.zones : [];
  const rawAgents = Array.isArray(envelope?.data?.agents) ? envelope.data.agents : [];
  const zones = rawZones
    .map((zone, index) => ({
      zoneKey: cleanText(zone.zoneKey),
      displayName: cleanText(zone.displayName),
      sortOrder: cleanSortOrder(zone.sortOrder, index)
    }))
    .filter((zone) => zone.zoneKey && zone.displayName)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const zoneKeys = new Set(zones.map((zone) => zone.zoneKey));
  const rawAgentByKey = new Map(
    rawAgents
      .map((agent, index) => ({
        agent,
        index,
        agentKey: cleanText(agent.agentKey),
        zoneKey: cleanText(agent.zoneKey)
      }))
      .filter((item) => item.agentKey && zoneKeys.has(item.zoneKey))
      .map((item) => [item.agentKey, item] as const)
  );
  const experts = Array.from(rawAgentByKey.values())
    .sort(
      (left, right) =>
        cleanSortOrder(left.agent.sortOrder, left.index) -
        cleanSortOrder(right.agent.sortOrder, right.index)
    )
    .map(({ agent, agentKey, zoneKey }) => {
      const fallback = fallbackExpert(agentKey);
      const displayName = cleanText(agent.displayName) || fallback?.name || agentKey;
      const zoneName =
        zones.find((zone) => zone.zoneKey === zoneKey)?.displayName ||
        fallback?.zoneTitle ||
        "未分类";
      const binding = resolveCatalogBinding(agent, fallback);

      if (!binding.knowledgeBaseId || !binding.namespace) {
        return null;
      }

      return {
        id: agentKey,
        name: displayName,
        description:
          cleanText(agent.description) ||
          fallback?.description ||
          `${displayName} 的固定知识库 Agent。`,
        author: fallback?.author ?? "超级管理员目录",
        heat: fallback?.heat ?? "New",
        usage: fallback?.usage ?? "0",
        favorites: fallback?.favorites ?? "0",
        category: fallback?.category ?? zoneName,
        subcategory: fallback?.subcategory ?? "AI工具",
        zoneId: zoneKey as IngestExpert["zoneId"],
        zoneTitle: zoneName,
        avatar: cleanText(agent.avatar) || fallback?.avatar || displayName.slice(0, 1),
        tone: fallback?.tone ?? "slate",
        badge: fallback?.badge,
        tags: fallback?.tags ?? [zoneName, "固定知识库"],
        knowledgeBaseId: binding.knowledgeBaseId,
        namespace: binding.namespace,
        aliases: cleanAliases(agent.aliases)
      } satisfies IngestExpert;
    })
    .filter((expert) => expert !== null) as IngestExpert[];

  if (!zones.length || !experts.length) {
    return fallbackSnapshot;
  }

  const expertsByZone = new Map<string, string[]>();
  for (const expert of experts) {
    const entries = expertsByZone.get(expert.zoneId) ?? [];
    entries.push(expert.id);
    expertsByZone.set(expert.zoneId, entries);
  }

  return {
    zones: zones.map((zone, index) => {
      const fallback = ingestExpertZones.find((item) => item.id === zone.zoneKey);
      return {
        id: zone.zoneKey as IngestExpertZone["id"],
        label: zone.displayName,
        title: fallback?.title ?? zone.displayName,
        subtitle: fallback?.subtitle ?? "Expert Zone",
        accent: fallback?.accent ?? zoneAccents[index % zoneAccents.length],
        experts: expertsByZone.get(zone.zoneKey) ?? []
      };
    }),
    experts,
    source: "remote"
  };
}

export async function fetchIngestExpertCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/public/expert-catalog", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error("EXPERT_CATALOG_UNAVAILABLE");
  }

  const payload = (await response.json()) as PublicCatalogEnvelope;
  if (payload.ok !== true && payload.success !== true) {
    throw new Error("EXPERT_CATALOG_UNAVAILABLE");
  }

  return mapPublicExpertCatalog(payload);
}

export function getFallbackIngestExpertCatalog() {
  return fallbackSnapshot;
}
