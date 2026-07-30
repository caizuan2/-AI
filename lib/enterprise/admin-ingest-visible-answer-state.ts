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

export function hasVisibleReplyForActiveIngestProvider(
  state: IngestConversationState | null | undefined,
  providers: readonly string[]
) {
  const activeRequestId = state?.activeRequestId?.trim();
  const providerSet = new Set(
    providers.map((provider) => provider.trim().toLowerCase()).filter(Boolean)
  );

  if (!activeRequestId || providerSet.size === 0) {
    return false;
  }

  return (state?.messages ?? []).some((message) => {
    if (
      message.role !== "assistant"
      || message.requestId !== activeRequestId
      || message.content.trim().length === 0
    ) {
      return false;
    }

    const metadata = message.meta ?? {};

    return [metadata.provider, metadata.requestedProvider, metadata.actualProvider]
      .some((provider) => (
        typeof provider === "string"
        && providerSet.has(provider.trim().toLowerCase())
      ));
  });
}

export function shouldShowAdminIngestParsingProgress(input: {
  isParsing: boolean;
  isRequestActive: boolean;
  hasFullIngestAccess: boolean;
  hasVisibleReply: boolean;
  hideWhenVisibleReply?: boolean;
}) {
  return input.isParsing
    && input.isRequestActive
    && (!input.hideWhenVisibleReply || !input.hasVisibleReply)
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
