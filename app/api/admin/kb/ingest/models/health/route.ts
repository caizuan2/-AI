import { checkDeepSeekIngestHealth } from "@/lib/enterprise/deepseek-health-check";
import { checkKimiIngestHealth } from "@/lib/enterprise/kimi-health-check";
import { checkOpenAIIngestHealth } from "@/lib/enterprise/openai-health-check";
import { checkQwenIngestHealth } from "@/lib/enterprise/qwen-health-check";
import { normalizeIngestModelProvider } from "@/lib/enterprise/ingest-model-options";

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
  const provider = normalizeIngestModelProvider(url.searchParams.get("provider"));
  const input = {
    preferredModel: url.searchParams.get("preferredModel"),
    selectedModelLabel: url.searchParams.get("selectedModelLabel")
  };

  if (provider === "deepseek" || provider === "deepseek-pro" || provider === "deepseek-flash") {
    return jsonUtf8(await checkDeepSeekIngestHealth(input));
  }

  if (provider === "kimi") {
    return jsonUtf8(await checkKimiIngestHealth(input));
  }

  if (provider === "qwen") {
    return jsonUtf8(await checkQwenIngestHealth(input));
  }

  return jsonUtf8(await checkOpenAIIngestHealth(input));
}
