import { checkOpenAIIngestHealth } from "@/lib/enterprise/openai-health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const health = await checkOpenAIIngestHealth({
    preferredModel: url.searchParams.get("preferredModel"),
    selectedModelLabel: url.searchParams.get("selectedModelLabel")
  });

  return jsonUtf8(health);
}
