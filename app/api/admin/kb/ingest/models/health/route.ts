import { checkDeepSeekIngestHealth } from "@/lib/enterprise/deepseek-health-check";
import { checkKimiIngestHealth } from "@/lib/enterprise/kimi-health-check";
import { checkOpenAIIngestHealth } from "@/lib/enterprise/openai-health-check";
import { checkQwenIngestHealth } from "@/lib/enterprise/qwen-health-check";
import {
  normalizeIngestModelProvider,
  resolveIngestModelRuntime
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
  const providerParam = url.searchParams.get("provider");
  const runtime = resolveIngestModelRuntime({
    provider: providerParam,
    preferredModel: url.searchParams.get("preferredModel"),
    selectedModelLabel: url.searchParams.get("selectedModelLabel")
  });
  const provider = providerParam ? normalizeIngestModelProvider(providerParam) : runtime.provider;
  const input = {
    preferredModel: runtime.actualModel,
    selectedModelLabel: runtime.displayModelLabel
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
