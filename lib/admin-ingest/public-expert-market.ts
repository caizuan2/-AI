import { ingestExperts, ingestExpertZones } from "@/lib/enterprise/mock-experts";

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

type ExpertPublicId = {
  kb_id: string;
  expert_id: string;
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

const PUBLIC_EXPERT_IDS: Record<string, ExpertPublicId> = {
  "expert-health": {
    kb_id: "kb-health-expert",
    expert_id: "expert-health"
  },
  "expert-career": {
    kb_id: "kb-career-mentor",
    expert_id: "expert-career"
  },
  "expert-slim-kks": {
    kb_id: "kb-kks-slim",
    expert_id: "expert-kks"
  },
  "expert-sansheng-china": {
    kb_id: "kb-sansheng-china",
    expert_id: "expert-sansheng-china"
  },
  "expert-sansheng-assets": {
    kb_id: "kb-sansheng-assets",
    expert_id: "expert-sansheng-assets"
  },
  "expert-market-assets": {
    kb_id: "kb-market-assets",
    expert_id: "expert-market-assets"
  },
  "expert-seed-camp": {
    kb_id: "kb-seed-camp",
    expert_id: "expert-seed-camp"
  },
  "expert-leader-road": {
    kb_id: "kb-leader-road",
    expert_id: "expert-leader-road"
  },
  "expert-army": {
    kb_id: "kb-army-growth",
    expert_id: "expert-army"
  }
};

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
  const publicIds = PUBLIC_EXPERT_IDS[input.expertId];

  if (!expert || !publicIds) {
    return null;
  }

  return {
    id: publicIds.expert_id,
    kb_id: publicIds.kb_id,
    kbId: publicIds.kb_id,
    knowledgeBaseId: publicIds.kb_id,
    expert_id: publicIds.expert_id,
    expertId: publicIds.expert_id,
    agentId: publicIds.expert_id,
    tenant_id: input.tenantId,
    tenantId: input.tenantId,
    namespace: publicIds.kb_id,
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
        .filter((expertId): expertId is string => Boolean(expertId && PUBLIC_EXPERT_IDS[expertId]))
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
