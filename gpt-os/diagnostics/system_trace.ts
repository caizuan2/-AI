export interface GptOsSystemTrace {
  trace_id: string;
  request_id: string;
  model: string;
  actualModel: string;
  route_decision: string;
  fallbackUsed: boolean;
  provider_status: string;
  rag_topK: number;
  hitCount: number;
  contextChars: number;
  latency_ms: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function createSystemTrace(
  input: Omit<GptOsSystemTrace, "timestamp">,
): GptOsSystemTrace {
  // Trace objects are in-memory diagnostics for future GPT OS adoption; no DB writes happen here.
  return {
    ...input,
    timestamp: new Date().toISOString(),
  };
}
