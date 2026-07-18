import { apiError, apiSuccess } from "@/lib/api-response";
import { requireLicensedUser } from "@/lib/auth/guards";
import { readRuntimeV2Memories } from "@/lib/knowledge-runtime/runtime-v2-memory-bridge";
import { normalizeRuntimeV2Scope } from "@/lib/knowledge-runtime/runtime-v2-guard";
import { normalizeRuntimeV2Sources } from "@/lib/knowledge-runtime/runtime-v2-source-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scopeFromSearchParams(params: URLSearchParams, userId: string) {
  return normalizeRuntimeV2Scope({
    query: readString(params.get("query")) ?? "runtime memory recall",
    userId,
    conversationId: readString(params.get("conversationId")),
    agentId: readString(params.get("agentId")),
    expertId: readString(params.get("expertId")),
    knowledgeBaseId: readString(params.get("knowledgeBaseId")),
    kbId: readString(params.get("kbId")),
    namespace: readString(params.get("namespace")),
    tenantId: readString(params.get("tenantId")),
    appType: "user_app",
    channel: "knowledge-query",
    platform: "web",
    outputMode: "auto",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    const user = await requireLicensedUser();
    const scope = scopeFromSearchParams(new URL(request.url).searchParams, user.id);
    const result = await readRuntimeV2Memories(scope);

    return apiSuccess({
      memoryApplied: result.usedMemoryIds.length > 0,
      usedMemoryIds: result.usedMemoryIds,
      memoryTrace: result.memoryTrace,
      warnings: result.warnings,
      memories: result.memories,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireLicensedUser();
    const body = await request.json().catch(() => ({}));
    const record = isRecord(body) ? body : {};
    const scope = normalizeRuntimeV2Scope({
      query: readString(record.query) ?? "runtime memory recall",
      userId: user.id,
      conversationId: readString(record.conversationId),
      agentId: readString(record.agentId),
      expertId: readString(record.expertId),
      knowledgeBaseId: readString(record.knowledgeBaseId),
      kbId: readString(record.kbId),
      namespace: readString(record.namespace),
      tenantId: readString(record.tenantId),
      appType: "user_app",
      channel: "knowledge-query",
      platform: "web",
      outputMode: "auto",
    });
    const result = await readRuntimeV2Memories(scope, {
      sources: normalizeRuntimeV2Sources(record.sources),
      rawValue: record,
    });

    return apiSuccess({
      memoryApplied: result.usedMemoryIds.length > 0,
      usedMemoryIds: result.usedMemoryIds,
      memoryTrace: result.memoryTrace,
      warnings: result.warnings,
      memories: result.memories,
    });
  } catch (error) {
    return apiError(error);
  }
}
