import { checkDeepSeekIngestHealth } from "@/lib/enterprise/deepseek-health-check";
import {
  normalizeIngestModelSelection
} from "@/lib/enterprise/ingest-model-options";

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
  const selection = normalizeIngestModelSelection({
    provider: url.searchParams.get("provider"),
    preferredModel: url.searchParams.get("preferredModel"),
    selectedModelLabel: url.searchParams.get("selectedModelLabel")
  });
  const health = await checkDeepSeekIngestHealth({
    preferredModel: selection.actualModel,
    selectedModelLabel: selection.displayModelLabel
  });

  return jsonUtf8({
    ...health,
    provider: "deepseek",
    normalizedFrom: selection.normalizedFrom,
    diagnostics: [
      ...(health.diagnostics ?? []),
      selection.normalizedFrom
        ? `gptHealth:normalizedFrom:${selection.normalizedFrom}`
        : "gptHealth:deepseekPrimary"
    ]
  });
}
