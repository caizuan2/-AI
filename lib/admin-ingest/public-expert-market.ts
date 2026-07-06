import { ingestExperts, ingestExpertZones } from "@/lib/enterprise/mock-experts";
import { resolvePublicExpertScope } from "@/lib/enterprise/public-expert-scope";

export type PublicExpertSectionKey = "market" | "news" | "domain";

export type PublicKnowledgeBaseItem = {
  id: string;
  kb_id: string;
  kbId: string;
  knowledgeBaseId: string;
  expert_id: string;
  expertId: string;
  agentId: string;
  tenant_id: string;
  tenantId: string;
  namespace: string;
  name: string;
  title: string;
  expertName: string;
  description: string;
  category: string;
  sectionKey: PublicExpertSectionKey;
  status: "published";
  visibility: "public";
};

export type PublicExpertMarketSection = {
  key: PublicExpertSectionKey;
  title: string;
  items: PublicKnowledgeBaseItem[];
};

const PUBLIC_SECTION_MAP = {
  market: {
    key: "market",
    title: "市场专区"
  },
  news: {
    key: "news",
    title: "资讯专区"
  },
  leader: {
    key: "domain",
    title: "领域专区"
  }
} as const;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function matchesQuery(item: PublicKnowledgeBaseItem, query: string) {
  if (!query) {
    return true;
  }

  return [
    item.title,
    item.expertName,
    item.description,
    item.category,
    item.kb_id,
    item.expert_id
  ].join(" ").toLowerCase().includes(query);
}

function toPublicItem(input: {
  expertId: string;
  tenantId: string;
  sectionKey: PublicExpertSectionKey;
  sectionTitle: string;
}): PublicKnowledgeBaseItem | null {
  const expert = ingestExperts.find((item) => item.id === input.expertId);
  const publicScope = resolvePublicExpertScope({
    agentId: input.expertId,
    expertId: input.expertId,
    tenantId: input.tenantId
  });

  if (!expert || !publicScope) {
    return null;
  }

  return {
    id: publicScope.agentId,
    kb_id: publicScope.knowledgeBaseId,
    kbId: publicScope.knowledgeBaseId,
    knowledgeBaseId: publicScope.knowledgeBaseId,
    expert_id: publicScope.expertId,
    expertId: publicScope.expertId,
    agentId: publicScope.agentId,
    tenant_id: input.tenantId,
    tenantId: input.tenantId,
    namespace: publicScope.namespace,
    name: expert.name,
    title: expert.name,
    expertName: expert.name,
    description: expert.description,
    category: input.sectionTitle,
    sectionKey: input.sectionKey,
    status: "published",
    visibility: "public"
  };
}

export function getPublicExpertMarketSections(input: {
  tenantId?: string;
  query?: string;
} = {}): PublicExpertMarketSection[] {
  const tenantId = input.tenantId?.trim() || "default";
  const query = normalizeText(input.query);

  return ingestExpertZones
    .map((zone) => {
      const mapped = PUBLIC_SECTION_MAP[zone.id];
      const items = zone.experts
        .map((expertName) => ingestExperts.find((expert) => expert.name === expertName)?.id)
        .filter((expertId): expertId is string => Boolean(expertId))
        .map((expertId) => toPublicItem({
          expertId,
          tenantId,
          sectionKey: mapped.key,
          sectionTitle: mapped.title
        }))
        .filter((item): item is PublicKnowledgeBaseItem => Boolean(item))
        .filter((item) => matchesQuery(item, query));

      return {
        key: mapped.key,
        title: mapped.title,
        items
      };
    })
    .filter((section) => section.items.length > 0 || !query);
}

export function getPublicExpertMarketItems(input: {
  tenantId?: string;
  query?: string;
} = {}) {
  return getPublicExpertMarketSections(input).flatMap((section) => section.items);
}
