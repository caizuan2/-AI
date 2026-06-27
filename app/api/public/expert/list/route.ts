import { NextResponse } from "next/server";
import { getPublicExpertMarketItems } from "@/lib/admin-ingest/public-expert-market";

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
    const items = getPublicExpertMarketItems({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined
    });

    return jsonResponse({
      ok: true,
      source: "worktree2-public-expert-market",
      items
    });
  } catch {
    return jsonResponse({
      ok: false,
      message: "专家库暂不可用",
      items: []
    }, { status: 200 });
  }
}
