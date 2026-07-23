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
