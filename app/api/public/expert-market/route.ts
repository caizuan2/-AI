import { NextResponse } from "next/server";
import {
  getPublicExpertMarketItems,
  getPublicExpertMarketSections
} from "@/lib/admin-ingest/public-expert-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ...(init?.headers ?? {})
    }
  });
}

export function OPTIONS() {
  return jsonResponse({ ok: true }, { status: 200 });
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sections = getPublicExpertMarketSections({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined
    });
    const items = getPublicExpertMarketItems({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined
    });
    const knowledgeBases = items.map((item) => ({
      id: item.kb_id,
      kb_id: item.kb_id,
      kbId: item.kbId,
      knowledgeBaseId: item.knowledgeBaseId,
      expert_id: item.expert_id,
      expertId: item.expertId,
      agentId: item.agentId,
      tenant_id: item.tenant_id,
      tenantId: item.tenantId,
      namespace: item.namespace,
      name: item.title,
      title: item.title,
      description: item.description,
      category: item.category,
      status: item.status,
      visibility: item.visibility
    }));

    return jsonResponse({
      ok: true,
      success: true,
      source: "worktree2-public-expert-market",
      sections,
      experts: items,
      items,
      knowledgeBases,
      data: {
        experts: items,
        knowledgeBases,
        sections
      }
    });
  } catch {
    return jsonResponse({
      ok: true,
      success: true,
      degraded: true,
      reason: "PUBLIC_EXPERT_MARKET_FALLBACK",
      message: "专家库暂不可用，已返回公共兜底空列表。",
      sections: [],
      experts: [],
      items: [],
      knowledgeBases: [],
      data: {
        experts: [],
        knowledgeBases: [],
        sections: []
      }
    }, { status: 200 });
  }
}
