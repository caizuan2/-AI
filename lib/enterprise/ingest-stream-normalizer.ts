"use client";

export type IngestStreamEvent =
  | {
      type: "delta";
      requestId: string;
      conversationId?: string;
      text: string;
    }
  | {
      type: "complete";
      requestId: string;
      conversationId?: string;
      text: string;
      warning?: string;
    }
  | {
      type: "error";
      requestId: string;
      conversationId?: string;
      message: string;
      retryable?: boolean;
    }
  | {
      type: "warning";
      requestId: string;
      conversationId?: string;
      message: string;
    };

export function normalizeJsonToIngestStreamEvent(input: {
  requestId: string;
  conversationId?: string;
  text?: string;
  warning?: string;
  error?: string;
  retryable?: boolean;
}): IngestStreamEvent {
  if (input.error && !input.text?.trim()) {
    return {
      type: "error",
      requestId: input.requestId,
      conversationId: input.conversationId,
      message: input.error,
      retryable: input.retryable
    };
  }

  if (input.warning && !input.text?.trim()) {
    return {
      type: "warning",
      requestId: input.requestId,
      conversationId: input.conversationId,
      message: input.warning
    };
  }

  return {
    type: "complete",
    requestId: input.requestId,
    conversationId: input.conversationId,
    text: input.text ?? "",
    warning: input.warning
  };
}
