export function excludeFailedIngestMessages<T extends { status?: string }>(messages: readonly T[]) {
  return messages.filter((message) => message.status !== "failed");
}

export function replaceIngestRetryOutcome<T extends { id: string }>(
  messages: readonly T[],
  failedMessageId: string | undefined,
  nextMessage: T
) {
  const retainedMessages = messages.filter((message) => (
    message.id !== nextMessage.id
    && (!failedMessageId || message.id !== failedMessageId)
  ));

  return [...retainedMessages, nextMessage];
}

export function resolveIngestSendAttachments<T>(
  currentAttachments: readonly T[],
  retryAttachments: readonly T[] | undefined
) {
  return retryAttachments === undefined
    ? [...currentAttachments]
    : [...retryAttachments];
}

type IngestRegenerateMessage<TAttachment> = {
  id: string;
  role: string;
  content: string;
  attachments?: readonly TAttachment[];
};

export function resolveIngestRegenerateRequest<TAttachment>(
  messages: readonly IngestRegenerateMessage<TAttachment>[],
  assistantMessageId: string
) {
  const assistantMessageIndex = messages.findIndex((message) => (
    message.id === assistantMessageId
    && message.role === "assistant"
  ));

  if (assistantMessageIndex <= 0) {
    return null;
  }

  const previousUserMessage = messages
    .slice(0, assistantMessageIndex)
    .reverse()
    .find((message) => message.role === "user");
  const visibleInput = previousUserMessage?.content.trim() ?? "";

  if (!previousUserMessage || !visibleInput) {
    return null;
  }

  return {
    visibleInput,
    reuseUserMessageId: previousUserMessage.id,
    replaceAssistantMessageId: assistantMessageId,
    retryAttachments: [...(previousUserMessage.attachments ?? [])]
  };
}
