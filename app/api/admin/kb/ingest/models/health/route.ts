import { apiError } from "@/lib/api-response";
import { checkDeepSeekIngestHealth } from "@/lib/enterprise/deepseek-health-check";
import { checkDoubaoIngestHealth } from "@/lib/enterprise/doubao-health-check";
import { checkKimiIngestHealth } from "@/lib/enterprise/kimi-health-check";
import { checkOpenAIIngestHealth } from "@/lib/enterprise/openai-health-check";
import { checkQwenIngestHealth } from "@/lib/enterprise/qwen-health-check";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  normalizeIngestModelProvider,
  resolveIngestModelRuntime
} from "@/lib/enterprise/ingest-model-options";
import { hasDatabaseUrl } from "@/lib/server-config";

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

function isLocalDevWithoutDatabase(request: Request) {
  if (process.env.NODE_ENV === "production" || hasDatabaseUrl()) {
    return false;
  }

  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function GET(request: Request) {
  try {
    await requireAdminIngestChatActor();
  } catch (error) {
    if (!isLocalDevWithoutDatabase(request)) {
      return apiError(error);
    }
  }

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

  if (provider === "doubao-pro") {
    return jsonUtf8(await checkDoubaoIngestHealth({
      ...input,
      testRequest: url.searchParams.get("testRequest") === "true",
      forceTestRequest: url.searchParams.get("forceTestRequest") === "true"
    }));
  }

  if (provider === "qwen") {
    return jsonUtf8(await checkQwenIngestHealth(input));
  }

  return jsonUtf8(await checkOpenAIIngestHealth(input));
}
