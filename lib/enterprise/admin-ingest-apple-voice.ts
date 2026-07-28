import type { AdminIngestPlatform } from "@/lib/enterprise/admin-ingest-app-config";

export const ADMIN_INGEST_APPLE_SPEECH_EVENT = "admin-ingest-native-speech";

export interface AdminIngestAppleVoiceController {
  stop: () => void;
  cancel: () => void;
}

type AppleVoiceEventState = "started" | "audio" | "cancelled" | "error";

interface AppleVoiceEventDetail {
  state: AppleVoiceEventState;
  sessionId: string;
  audioBase64?: string;
  mimeType?: string;
  fileName?: string;
  error?: string;
}

interface StartAdminIngestAppleVoiceOptions {
  sessionId: string;
  eventName?: string;
  maxDurationMs?: number;
}

const APPLE_VOICE_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm"
] as const;

export function isAdminIngestApplePlatform(
  platform: AdminIngestPlatform
): platform is "ios" | "macos" {
  return platform === "ios" || platform === "macos";
}

export function supportsAdminIngestAppleVoiceRecording() {
  return typeof window !== "undefined"
    && typeof window.MediaRecorder === "function"
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

function selectAppleVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return APPLE_VOICE_MIME_TYPES.find((mimeType) => (
    typeof MediaRecorder.isTypeSupported !== "function"
    || MediaRecorder.isTypeSupported(mimeType)
  )) ?? "";
}

function dispatchAppleVoiceEvent(eventName: string, detail: AppleVoiceEventDetail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("APPLE_VOICE_FILE_READ_FAILED"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separatorIndex = result.indexOf(",");
      const audioBase64 = separatorIndex >= 0 ? result.slice(separatorIndex + 1) : "";

      if (!audioBase64) {
        reject(new Error("APPLE_VOICE_AUDIO_EMPTY"));
        return;
      }

      resolve(audioBase64);
    };
    reader.readAsDataURL(blob);
  });
}

export async function startAdminIngestAppleVoiceRecording({
  sessionId,
  eventName = ADMIN_INGEST_APPLE_SPEECH_EVENT,
  maxDurationMs = 45_000
}: StartAdminIngestAppleVoiceOptions): Promise<AdminIngestAppleVoiceController> {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    throw new Error("APPLE_VOICE_SESSION_REQUIRED");
  }

  if (!supportsAdminIngestAppleVoiceRecording()) {
    throw new Error("APPLE_VOICE_MEDIA_RECORDER_UNAVAILABLE");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  const mimeType = selectAppleVoiceMimeType();
  const chunks: BlobPart[] = [];
  let cancelled = false;
  let completed = false;
  let timeoutId: number | null = null;
  let recorder: MediaRecorder;

  const stopTracks = () => {
    stream.getTracks().forEach((track) => track.stop());
  };
  const clearRecordingTimeout = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  const dispatchError = (message: string) => {
    if (completed) {
      return;
    }

    completed = true;
    clearRecordingTimeout();
    stopTracks();
    dispatchAppleVoiceEvent(eventName, {
      state: "error",
      sessionId: normalizedSessionId,
      error: message
    });
  };

  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 48_000
    });
  } catch (error) {
    stopTracks();
    throw error;
  }

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.addEventListener("error", () => {
    dispatchError("录音发生错误，请检查系统麦克风权限后重试。");
  });
  recorder.addEventListener("stop", () => {
    if (completed) {
      return;
    }

    clearRecordingTimeout();
    stopTracks();

    if (cancelled) {
      completed = true;
      dispatchAppleVoiceEvent(eventName, {
        state: "cancelled",
        sessionId: normalizedSessionId
      });
      return;
    }

    const actualMimeType = recorder.mimeType || mimeType || "audio/mp4";
    const extension = actualMimeType.includes("webm") ? "webm" : "m4a";
    const blob = new Blob(chunks, { type: actualMimeType });

    void readBlobAsBase64(blob)
      .then((audioBase64) => {
        if (completed) {
          return;
        }

        completed = true;
        dispatchAppleVoiceEvent(eventName, {
          state: "audio",
          sessionId: normalizedSessionId,
          audioBase64,
          mimeType: actualMimeType,
          fileName: `admin-ingest-apple-voice-${Date.now()}.${extension}`
        });
      })
      .catch(() => {
        dispatchError("没有读取到有效录音，请重新录制。");
      });
  });

  recorder.start(1_000);
  dispatchAppleVoiceEvent(eventName, {
    state: "started",
    sessionId: normalizedSessionId
  });
  timeoutId = window.setTimeout(() => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }, Math.max(5_000, maxDurationMs));

  return {
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") {
        recorder.stop();
        return;
      }

      if (!completed) {
        completed = true;
        clearRecordingTimeout();
        stopTracks();
        dispatchAppleVoiceEvent(eventName, {
          state: "cancelled",
          sessionId: normalizedSessionId
        });
      }
    }
  };
}
