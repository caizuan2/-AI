import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpertMarketItem = {
  kb_id: string;
  kbId: string;
  knowledgeBaseId: string;
  expert_id?: string;
  expertId?: string;
  agentId?: string;
  tenant_id?: string;
  tenantId?: string;
  namespace?: string;
  title: string;
  name: string;
  expertName?: string;
  category?: string;
  description?: string;
};

type ExpertMarketSection = {
  key: string;
  title: string;
  items: ExpertMarketItem[];
};

const EXPERT_MARKET_PATHS = [
  "/api/public/expert-market",
  "/api/public/expert/list",
  "/api/public/kb/list"
];

const SECTION_TITLES: Record<string, string> = {
  market: "市场专区",
  news: "资讯专区",
  domain: "领域专区"
};

function cleanText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickArray(payload: unknown): unknown[] {
  const record = getRecord(payload);

  if (!record) {
    return [];
  }

  const data = getRecord(record.data);
  const candidates = [
    record.sections,
    record.items,
    record.experts,
    record.knowledgeBases,
    record.kbs,
    data?.sections,
    data?.items,
    data?.experts,
    data?.knowledgeBases,
    data?.kbs
  ];

  return candidates.map(getArray).find((items) => items.length > 0) ?? [];
}

function normalizeItem(value: unknown, fallbackCategory?: string): ExpertMarketItem | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const kbId = cleanText(record.kb_id ?? record.kbId ?? record.knowledgeBaseId ?? record.id, 120);
  const expertId = cleanText(record.expert_id ?? record.expertId ?? record.agentId ?? record.ownerId, 120);
  const tenantId = cleanText(record.tenant_id ?? record.tenantId ?? record.orgId, 120);
  const namespace = cleanText(record.namespace ?? record.scope ?? record.space, 120) || tenantId || "default";
  const title = cleanText(record.title ?? record.name ?? record.kbTitle ?? record.knowledgeBaseTitle, 120);

  if (!kbId || !title) {
    return null;
  }

  return {
    kb_id: kbId,
    kbId,
    knowledgeBaseId: kbId,
    expert_id: expertId || undefined,
    expertId: expertId || undefined,
    agentId: expertId || undefined,
    tenant_id: tenantId || undefined,
    tenantId: tenantId || undefined,
    namespace,
    title,
    name: title,
    expertName: cleanText(record.expertName ?? record.expert_name ?? record.author ?? record.ownerName, 120) || undefined,
    category: cleanText(record.category ?? record.section ?? fallbackCategory, 80) || fallbackCategory,
    description: cleanText(record.description ?? record.summary ?? record.intro, 260) || undefined
  };
}

function sectionKeyFromCategory(category: string | undefined) {
  const value = (category || "").toLowerCase();

  if (value.includes("资讯") || value.includes("news")) {
    return "news";
  }

  if (value.includes("领域") || value.includes("domain")) {
    return "domain";
  }

  return "market";
}

function normalizeSections(payload: unknown): ExpertMarketSection[] {
  const rawSections = pickArray(payload);
  const sectionMap = new Map<string, ExpertMarketItem[]>();

  for (const raw of rawSections) {
    const sectionRecord = getRecord(raw);
    const nestedItems = getArray(sectionRecord?.items);

    if (nestedItems.length > 0) {
      const category = cleanText(sectionRecord?.title ?? sectionRecord?.name ?? sectionRecord?.key, 80);

      for (const item of nestedItems) {
        const normalized = normalizeItem(item, category);

        if (!normalized) {
          continue;
        }

        const key = sectionKeyFromCategory(normalized.category);
        sectionMap.set(key, [...(sectionMap.get(key) ?? []), normalized]);
      }

      continue;
    }

    const normalized = normalizeItem(raw);

    if (!normalized) {
      continue;
    }

    const key = sectionKeyFromCategory(normalized.category);
    sectionMap.set(key, [...(sectionMap.get(key) ?? []), normalized]);
  }

  return ["market", "news", "domain"]
    .map((key) => ({
      key,
      title: SECTION_TITLES[key],
      items: sectionMap.get(key) ?? []
    }))
    .filter((section) => section.items.length > 0);
}

function getExpertMarketBaseUrls(request: Request) {
  let requestOrigin = "";

  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    requestOrigin = "";
  }

  const runtimePort = process.env.PORT || "3021";
  const developmentOnlyUrls = process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3056",
        "http://127.0.0.1:3056"
      ]
    : [];

  return Array.from(new Set([
    requestOrigin,
    process.env.USER_EXPERT_MARKET_BASE_URL,
    process.env.INGEST_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_INGEST_PUBLIC_BASE_URL,
    `http://127.0.0.1:${runtimePort}`,
    `http://localhost:${runtimePort}`,
    "http://127.0.0.1:3021",
    "http://localhost:3021",
    "http://127.0.0.1:3052",
    "http://localhost:3052",
    "http://127.0.0.1:3053",
    "http://localhost:3053",
    ...developmentOnlyUrls
  ].filter((value): value is string => Boolean(value))));
}

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
      return null;
    }

    return {
      response,
      payload: await response.json().catch(() => null)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  for (const baseUrl of getExpertMarketBaseUrls(request)) {
    for (const path of EXPERT_MARKET_PATHS) {
      const url = `${baseUrl}${path}`;
      const result = await fetchJsonWithTimeout(url).catch(() => null);

      if (!result?.payload) {
        continue;
      }

      const sections = normalizeSections(result.payload);

      if (sections.length > 0) {
        return NextResponse.json({
          ok: true,
          baseUrl,
          endpoint: path,
          sections
        });
      }
    }
  }

  return NextResponse.json({
    ok: false,
    success: false,
    errorCode: "UPSTREAM_UNAVAILABLE",
    message: "专家库暂未连接：当前未发现 Worktree 2 可公开读取的专家库列表接口。",
    baseUrl: null,
    endpoint: null,
    sections: []
  }, { status: 200 });
}
