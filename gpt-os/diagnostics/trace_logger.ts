import type { GptOsSystemTrace } from "./system_trace";
import { createSystemTrace } from "./system_trace";

export interface TraceLogger {
  record(trace: GptOsSystemTrace): void;
  list(): GptOsSystemTrace[];
  clear(): void;
}

export class InMemoryTraceLogger implements TraceLogger {
  private readonly traces: GptOsSystemTrace[] = [];

  record(trace: GptOsSystemTrace): void {
    // Stage 3 diagnostics stay local to the GPT OS skeleton and do not affect business requests.
    this.traces.push(trace);
  }

  list(): GptOsSystemTrace[] {
    return [...this.traces];
  }

  clear(): void {
    this.traces.length = 0;
  }
}

export function recordGptOsTrace(
  logger: TraceLogger,
  input: Omit<GptOsSystemTrace, "timestamp">,
): GptOsSystemTrace {
  const trace = createSystemTrace(input);
  logger.record(trace);
  return trace;
}
