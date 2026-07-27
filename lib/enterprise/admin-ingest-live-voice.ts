const ADMIN_INGEST_EMPTY_VOICE_TRANSCRIPTS = new Set([
  "无内容",
  "无语音",
  "无有效内容",
  "没有内容",
  "没有语音",
  "未识别到内容",
  "未识别到语音",
  "nospeech",
  "nocontent",
  "silence",
  "<|nospeech|>"
]);

export function normalizeAdminIngestVoiceTranscript(value: string) {
  const transcript = value.trim();

  if (!transcript) {
    return "";
  }

  const sentinel = transcript
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[()[\]{}（）【】「」『』《》"'`]/g, "")
    .replace(/[。.!！?？…]/g, "");

  if (ADMIN_INGEST_EMPTY_VOICE_TRANSCRIPTS.has(sentinel)) {
    return "";
  }

  return transcript;
}

export function composeAdminIngestLiveVoiceInput(
  baseInput: string,
  liveTranscript: string
) {
  const base = baseInput.trimEnd();
  const transcript = normalizeAdminIngestVoiceTranscript(liveTranscript);

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
