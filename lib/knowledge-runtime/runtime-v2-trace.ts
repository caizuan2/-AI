function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readRuntimeV2TraceId(value: unknown): string | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  return (
    readString(raw.traceId) ??
    readString(raw.trace_id) ??
    readString(raw.requestId) ??
    readString(raw.request_id)
  );
}

export function createRuntimeV2TraceId(seed?: string | null): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  const source = readString(seed) ?? "runtime-v2";
  return `${source.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32)}-${Date.now().toString(36)}-${suffix}`;
}
