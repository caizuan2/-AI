export function composeAdminIngestLiveVoiceInput(
  baseInput: string,
  liveTranscript: string
) {
  const base = baseInput.trimEnd();
  const transcript = liveTranscript.trim();

  if (!transcript) {
    return baseInput;
  }

  if (!base) {
    return transcript;
  }

  return `${base} ${transcript}`;
}

export function isCurrentAdminIngestVoiceEvent(input: {
  activeSessionId: string;
  eventSessionId?: string;
  startedHistoryScope: string;
  currentHistoryScope: string;
}) {
  const eventSessionId = input.eventSessionId?.trim() ?? "";

  if (
    input.startedHistoryScope
    && input.startedHistoryScope !== input.currentHistoryScope
  ) {
    return false;
  }

  if (
    input.activeSessionId
    && eventSessionId
    && input.activeSessionId !== eventSessionId
  ) {
    return false;
  }

  return true;
}
