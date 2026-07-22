export function excludeFailedIngestMessages<T extends { status?: string }>(messages: readonly T[]) {
  return messages.filter((message) => message.status !== "failed");
}

export function replaceIngestRetryOutcome<T extends { id: string }>(
  messages: readonly T[],
  failedMessageId: string | undefined,
  nextMessage: T
) {
  const retainedMessages = failedMessageId
    ? messages.filter((message) => message.id !== failedMessageId)
    : [...messages];

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
