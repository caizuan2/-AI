"use client";

type VoiceTranscriptionEnvelope = {
  ok?: boolean;
  data?: {
    transcript?: string;
    refinedText?: string;
  };
  message?: string;
  error?: {
    message?: string;
  };
};

export type AdminIngestNativeVoiceAudio = {
  audioBase64: string;
  fileName?: string;
  mimeType?: string;
};

const ADMIN_INGEST_VOICE_TRANSCRIPTION_ENDPOINT = "/api/admin/ingest-voice/transcribe";
const ADMIN_INGEST_VOICE_REFINEMENT_ENDPOINT = "/api/admin/ingest-voice/refine";
const ADMIN_INGEST_VOICE_TRANSCRIPTION_TIMEOUT_MS = 45_000;
const ADMIN_INGEST_VOICE_REFINEMENT_TIMEOUT_MS = 30_000;
const MAX_NATIVE_VOICE_BASE64_CHARS = 4 * 1024 * 1024;

function decodeNativeVoiceAudio(audioBase64: string) {
  const normalized = audioBase64.replace(/\s+/g, "");

  if (!normalized || normalized.length > MAX_NATIVE_VOICE_BASE64_CHARS) {
    throw new Error("语音录音无效或文件过大，请缩短录音后重试。");
  }

  let binary = "";

  try {
    binary = globalThis.atob(normalized);
  } catch {
    throw new Error("语音录音读取失败，请重新录制。");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function readVoiceTranscriptionError(
  response: Pick<Response, "status">,
  payload: VoiceTranscriptionEnvelope | null
) {
  const serverMessage = payload?.message?.trim() || payload?.error?.message?.trim();

  if (serverMessage) {
    return serverMessage;
  }

  if (response.status === 401) {
    return "登录状态已失效，请重新登录后再试。";
  }

  if (response.status === 403) {
    return "当前账号没有管理员投喂权限。";
  }

  if (response.status === 413) {
    return "语音录音过长，请缩短后重试。";
  }

  if (response.status === 429) {
    return "语音请求过于频繁，请稍后再试。";
  }

  return "语音转文字暂时不可用，请检查网络后重试。";
}

export async function transcribeAdminIngestNativeVoice(
  audio: AdminIngestNativeVoiceAudio,
  historyScope: string,
  parentSignal?: AbortSignal
) {
  const normalizedHistoryScope = historyScope.trim();

  if (!normalizedHistoryScope) {
    throw new Error("账号状态尚未加载，请稍后再试。");
  }

  const bytes = decodeNativeVoiceAudio(audio.audioBase64);
  const mimeType = audio.mimeType?.trim().toLowerCase() || "audio/mp4";
  const fileName = audio.fileName?.trim() || "admin-ingest-voice.m4a";
  const formData = new FormData();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const timeoutId = window.setTimeout(
    () => controller.abort(new DOMException("Voice transcription timed out.", "TimeoutError")),
    ADMIN_INGEST_VOICE_TRANSCRIPTION_TIMEOUT_MS
  );

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  formData.append("file", new File([bytes], fileName, { type: mimeType }), fileName);

  try {
    const response = await fetch(ADMIN_INGEST_VOICE_TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "x-admin-ingest-history-scope": normalizedHistoryScope
      }
    });
    const payload = await response.json().catch(() => null) as VoiceTranscriptionEnvelope | null;
    const transcript = payload?.data?.transcript?.trim() ?? "";

    if (!response.ok || !payload?.ok) {
      throw new Error(readVoiceTranscriptionError(response, payload));
    }

    if (!transcript) {
      throw new Error("没有识别到语音内容，请靠近麦克风后重试。");
    }

    return transcript;
  } catch (error) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new Error("语音转写等待超时，请检查网络后重试。");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function refineAdminIngestNativeVoice(
  transcript: string,
  historyScope: string,
  parentSignal?: AbortSignal
) {
  const normalizedTranscript = transcript.trim();
  const normalizedHistoryScope = historyScope.trim();

  if (!normalizedTranscript) {
    throw new Error("没有可整理的语音文字。");
  }

  if (!normalizedHistoryScope) {
    throw new Error("账号状态尚未加载，请稍后再试。");
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const timeoutId = window.setTimeout(
    () => controller.abort(new DOMException("Voice refinement timed out.", "TimeoutError")),
    ADMIN_INGEST_VOICE_REFINEMENT_TIMEOUT_MS
  );

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(ADMIN_INGEST_VOICE_REFINEMENT_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-admin-ingest-history-scope": normalizedHistoryScope
      },
      body: JSON.stringify({ transcript: normalizedTranscript })
    });
    const payload = await response.json().catch(() => null) as VoiceTranscriptionEnvelope | null;
    const refinedText = payload?.data?.refinedText?.trim() ?? "";

    if (!response.ok || !payload?.ok) {
      throw new Error(readVoiceTranscriptionError(response, payload));
    }

    if (!refinedText) {
      throw new Error("口语整理没有返回有效文字。");
    }

    return refinedText;
  } catch (error) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new Error("口语整理等待超时，已保留原始语音文字。");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
