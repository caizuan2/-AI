import { NextResponse } from "next/server";
import { checkOpenAIIngestHealth } from "@/lib/enterprise/openai-health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const health = await checkOpenAIIngestHealth({
    preferredModel: url.searchParams.get("preferredModel"),
    selectedModelLabel: url.searchParams.get("selectedModelLabel")
  });

  return NextResponse.json(health, { status: 200 });
}
