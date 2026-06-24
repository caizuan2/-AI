import { toAppError } from "@/lib/errors";

export type AiChatStreamEvent =
  | {
      type: "thinking";
      content: string;
    }
  | {
      type: "rag_search";
      query: string;
    }
  | {
      type: "rag_chunk";
      content: string;
      chunk_rank?: number | null;
      chunk_id?: string | null;
    }
  | {
      type: "rag_score";
      score: number;
      chunk_rank?: number | null;
    }
  | {
      type: "rag_source";
      source: string;
      title?: string | null;
      file_id?: string | null;
      chunk_id?: string | null;
    }
  | {
      type: "rag_done";
      hitCount?: number | null;
      topK?: number | null;
      relevance_score?: number | null;
    }
  | {
      type: "model_select";
      model: string;
    }
  | {
      type: "model_reason";
      reason: string;
    }
  | {
      type: "model_fallback";
      chain: string[];
    }
  | {
      type: "model_metrics";
      cost_score?: number | null;
      latency_score?: number | null;
      success_rate?: number | null;
      latency_ms?: number | null;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "final";
      content: string;
      data: StreamableAiChatResult;
    }
  | {
      type: "error";
      content: string;
      code: string;
    };

export interface StreamableAiChatResult {
  answer: string;
  conversation_id: string;
  message_id: string;
  mode: string;
  customer_answer?: string | null;
  sources?: unknown[] | null;
  confidence?: string | null;
  provider_status?: string | null;
  [key: string]: unknown;
}

type UnknownRecord = Record<string, unknown>;

interface AiChatSseWriter {
  enqueue: (chunk: string) => void;
}

interface CreateAiChatSseResponseInput {
  signal?: AbortSignal;
  producer: (helpers: {
    emit: (event: AiChatStreamEvent) => Promise<void>;
    streamResult: (result: StreamableAiChatResult) => Promise<void>;
    signal?: AbortSignal;
  }) => Promise<void>;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function waitForTokenFrame(signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = windowlessSetTimeout(resolve, 10);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }, { once: true });
  });
}

function windowlessSetTimeout(callback: () => void, timeout: number) {
  return setTimeout(callback, timeout);
}

export function splitTextIntoStreamTokens(content: string) {
  return Array.from(content);
}

export async function streamTextTokens(
  content: string,
  emit: (event: AiChatStreamEvent) => Promise<void>,
  signal?: AbortSignal
) {
  for (const token of splitTextIntoStreamTokens(content)) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    await emit({
      type: "token",
      content: token
    });
    await waitForTokenFrame(signal);
  }
}

export async function streamAiChatResult(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>,
  signal?: AbortSignal
) {
  await emit({
    type: "thinking",
    content: "知识库检索完成，正在生成最终答案..."
  });
  await emitRagVisualization(result, emit);
  await emitModelVisualization(result, emit);
  await streamTextTokens(result.answer ?? "", emit, signal);
  await emit({
    type: "final",
    content: result.answer ?? "",
    data: result
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function clamp01(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.min(1, value as number));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean)
    : [];
}

function readResultRecord(result: StreamableAiChatResult, key: string) {
  const value = result[key];

  return isRecord(value) ? value : {};
}

function getSourceRecords(result: StreamableAiChatResult) {
  return Array.isArray(result.sources)
    ? result.sources.filter(isRecord)
    : [];
}

async function emitRagVisualization(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>
) {
  const sources = getSourceRecords(result);
  const diagnostics = readResultRecord(result, "rag_diagnostics");
  const relevanceScore = clamp01(readNumber(result.relevance_score));

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const title = readString(source.title) || "知识片段";
    const chunkId = readString(source.chunk_id);
    const fileId = readString(source.file_id);
    const chunkRank = readNumber(source.chunk_rank) ?? index + 1;
    const score = clamp01(readNumber(source.relevance_score) ?? readNumber(source.score));

    await emit({
      type: "rag_chunk",
      content: title,
      chunk_rank: chunkRank,
      chunk_id: chunkId || null
    });

    if (score !== null) {
      await emit({
        type: "rag_score",
        score,
        chunk_rank: chunkRank
      });
    }

    await emit({
      type: "rag_source",
      source: fileId || chunkId || title,
      title,
      file_id: fileId || null,
      chunk_id: chunkId || null
    });
  }

  await emit({
    type: "rag_done",
    hitCount: readNumber(diagnostics.hitCount) ?? sources.length,
    topK: readNumber(diagnostics.topK),
    relevance_score: relevanceScore
  });
}

function resolveCostScore(result: StreamableAiChatResult) {
  const costMode = readString(result.cost_mode);

  if (costMode === "user_low_priority") {
    return 0.9;
  }

  if (costMode === "high_quality_required") {
    return 0.45;
  }

  return 0.65;
}

function resolveLatencyScore(latencyMs: number | null) {
  if (latencyMs === null) {
    return null;
  }

  if (latencyMs <= 800) {
    return 0.95;
  }

  if (latencyMs <= 1800) {
    return 0.72;
  }

  if (latencyMs <= 3500) {
    return 0.48;
  }

  return 0.26;
}

async function emitModelVisualization(
  result: StreamableAiChatResult,
  emit: (event: AiChatStreamEvent) => Promise<void>
) {
  const selectedModel = readString(result.selected_model) || readString(result.actualModel) || readString(result.model) || "unknown";
  const fallbackChain = (
    readStringArray(result.fallback_chain_v6).length > 0 ? readStringArray(result.fallback_chain_v6)
      : readStringArray(result.fallback_chain_v5).length > 0 ? readStringArray(result.fallback_chain_v5)
        : readStringArray(result.fallback_chain_v4).length > 0 ? readStringArray(result.fallback_chain_v4)
          : readStringArray(result.fallback_chain_v3).length > 0 ? readStringArray(result.fallback_chain_v3)
            : readStringArray(result.fallback_chain_v2).length > 0 ? readStringArray(result.fallback_chain_v2)
              : readStringArray(result.fallback_chain)
  );
  const diagnostics = readResultRecord(result, "rag_diagnostics");
  const hitCount = readNumber(diagnostics.hitCount);
  const relevanceScore = readNumber(result.relevance_score);
  const costMode = readString(result.cost_mode);
  const routeDecision = readString(result.route_decision);
  const latencyMs = readNumber(result.latency_ms);
  const feedbackEvent = readResultRecord(result, "model_feedback_event");
  const successRate = typeof feedbackEvent.was_successful === "boolean"
    ? feedbackEvent.was_successful ? 1 : 0
    : null;

  await emit({
    type: "model_select",
    model: selectedModel
  });
  await emit({
    type: "model_reason",
    reason: routeDecision || [
      hitCount && hitCount > 0 ? "RAG 已命中知识" : "RAG 命中较少",
      relevanceScore !== null && relevanceScore >= 0.7 ? "高相关度" : "需要增强推理",
      costMode || "balanced"
    ].filter(Boolean).join(" + ")
  });
  await emit({
    type: "model_fallback",
    chain: fallbackChain
  });
  await emit({
    type: "model_metrics",
    cost_score: resolveCostScore(result),
    latency_score: resolveLatencyScore(latencyMs),
    success_rate: successRate,
    latency_ms: latencyMs
  });
}

export function createAiChatSseResponse(input: CreateAiChatSseResponseInput) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writer: AiChatSseWriter = {
        enqueue(chunk) {
          if (closed || input.signal?.aborted) {
            return;
          }

          controller.enqueue(encoder.encode(chunk));
        }
      };

      const emit = async (event: AiChatStreamEvent) => {
        writer.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      const finish = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      input.signal?.addEventListener("abort", finish, { once: true });

      void (async () => {
        try {
          await input.producer({
            emit,
            streamResult: (result) => streamAiChatResult(result, emit, input.signal),
            signal: input.signal
          });

          if (!closed && !input.signal?.aborted) {
            writer.enqueue("data: [DONE]\n\n");
          }
        } catch (error) {
          if (!isAbortError(error) && !closed && !input.signal?.aborted) {
            const appError = toAppError(error);

            writer.enqueue(`data: ${JSON.stringify({
              type: "error",
              content: appError.message,
              code: appError.code
            } satisfies AiChatStreamEvent)}\n\n`);
            writer.enqueue("data: [DONE]\n\n");
          }
        } finally {
          finish();
        }
      })();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
