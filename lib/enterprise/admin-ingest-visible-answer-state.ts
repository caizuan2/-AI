import type { IngestConversationState } from "@/lib/enterprise/ingest-conversation-state";

type IngestAnswerMetadataState = "pending" | "ready" | "unavailable" | undefined;

export function hasVisibleReplyForActiveIngestRequest(
  state: IngestConversationState | null | undefined
) {
  const activeRequestId = state?.activeRequestId?.trim();

  if (!activeRequestId) {
    return false;
  }

  return (state?.messages ?? []).some((message) =>
    message.role === "assistant"
    && message.requestId === activeRequestId
    && message.content.trim().length > 0
  );
}

export function shouldShowAdminIngestParsingProgress(input: {
  isParsing: boolean;
  isRequestActive: boolean;
  hasFullIngestAccess: boolean;
  hasVisibleReply: boolean;
}) {
  return input.isParsing
    && input.isRequestActive
    && (input.hasFullIngestAccess || !input.hasVisibleReply);
}

export function shouldShowAdminIngestAnswerActions(input: {
  hasFullIngestAccess: boolean;
  role: string;
  messageId: string;
  content: string;
  metadataState: IngestAnswerMetadataState;
}) {
  const isAssistantResult = input.role === "assistant"
    && input.messageId.startsWith("assistant-result");

  if (!isAssistantResult) {
    return false;
  }

  const metadataReady = input.metadataState !== "pending"
    && input.metadataState !== "unavailable";

  return metadataReady || (!input.hasFullIngestAccess && input.content.trim().length > 0);
}
