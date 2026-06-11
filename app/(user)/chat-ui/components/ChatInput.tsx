"use client";

import * as React from "react";
import { Camera, FileText, Image as ImageIcon, Mic, Plus, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentMenu } from "./AttachmentMenu";
import type { ChatAttachmentDraft, ChatAttachmentSource, AttachmentType } from "../types";

interface ChatInputProps {
  value: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onSubmit: (attachments?: ChatAttachmentDraft[]) => Promise<boolean> | boolean | void;
  onStatusMessage?: (message: string) => void;
  openAttachmentSignal?: number;
  openCameraSignal?: number;
}

type SpeechRecognitionResultLike = {
  readonly 0: {
    transcript: string;
  };
  readonly isFinal?: boolean;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = "image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md";
export const SPEECH_UNSUPPORTED_MESSAGE = "当前设备暂不支持语音输入，请使用文字输入。";
export const SPEECH_PERMISSION_MESSAGE = "麦克风权限未开启，请在浏览器或系统设置中允许麦克风权限。";
export const SPEECH_NO_MICROPHONE_MESSAGE = "当前设备未检测到麦克风，请使用文字输入。";

const imageAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function mergeVoiceTranscript(currentValue: string, transcript: string) {
  const trimmedTranscript = transcript.trim();

  if (!trimmedTranscript) {
    return currentValue;
  }

  const trimmedCurrent = currentValue.trimEnd();

  return trimmedCurrent ? `${trimmedCurrent} ${trimmedTranscript}` : trimmedTranscript;
}

export function getSpeechRecognitionErrorMessage(error?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return SPEECH_PERMISSION_MESSAGE;
  }

  if (error === "audio-capture") {
    return SPEECH_NO_MICROPHONE_MESSAGE;
  }

  return "语音输入失败，请使用文字输入或稍后重试。";
}

function getErrorName(error: unknown) {
  return error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name
    : "";
}

export function getMicrophoneAccessErrorMessage(error: unknown) {
  const name = getErrorName(error);

  if (name === "NotAllowedError" || name === "SecurityError") {
    return SPEECH_PERMISSION_MESSAGE;
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return SPEECH_NO_MICROPHONE_MESSAGE;
  }

  return "语音输入启动失败，请使用文字输入或稍后重试。";
}

export function readSpeechRecognitionTranscript(event: SpeechRecognitionEventLike) {
  const results = Array.from(event.results);
  const finalTranscript = results
    .filter((result) => result.isFinal !== false)
    .map((result) => result[0]?.transcript ?? "")
    .join("")
    .trim();
  const interimTranscript = results
    .filter((result) => result.isFinal === false)
    .map((result) => result[0]?.transcript ?? "")
    .join("")
    .trim();

  return {
    finalTranscript,
    interimTranscript
  };
}

export function validateChatAttachmentFile(file: File) {
  if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    return "单个附件不能超过 10MB。";
  }

  return null;
}

function getAttachmentType(file: File, source: ChatAttachmentSource): AttachmentType {
  if (source === "camera") {
    return "camera_photo";
  }

  if (source === "gallery") {
    return "gallery_photo";
  }

  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return "file";
}

export function createChatAttachmentFromFile(file: File, source: ChatAttachmentSource): ChatAttachmentDraft {
  const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previewUrl = imageAttachmentTypes.has(file.type) ? URL.createObjectURL(file) : undefined;

  return {
    id,
    type: getAttachmentType(file, source),
    source,
    name: file.name,
    mime_type: file.type || "application/octet-stream",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    reference_id: id,
    previewUrl,
    url: previewUrl,
    metadata: {
      source
    }
  };
}

export function removeChatAttachment(
  attachments: ChatAttachmentDraft[],
  attachmentId: string
) {
  const removed = attachments.find((attachment) => attachment.id === attachmentId);

  if (removed?.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(removed.previewUrl);
  }

  return attachments.filter((attachment) => attachment.id !== attachmentId);
}

export function cleanupChatAttachments(items: ChatAttachmentDraft[]) {
  for (const item of items) {
    if (item.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

function formatAttachmentSize(size?: number) {
  if (!size || !Number.isFinite(size)) {
    return "";
  }

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

export function SelectedAttachmentList({
  attachments,
  onRemove
}: {
  attachments: ChatAttachmentDraft[];
  onRemove?: (attachmentId: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto px-1">
      {attachments.map((attachment) => {
        const isImage = attachment.type === "image" || attachment.type === "gallery_photo" || attachment.type === "camera_photo";
        const name = attachment.name || "未命名附件";

        return (
          <div
            key={attachment.id || name}
            className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-slate-500">
              {attachment.previewUrl && isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : isImage ? (
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[160px] truncate font-semibold">{name}</span>
              <span className="text-[11px] text-slate-400">{formatAttachmentSize(attachment.size)}</span>
            </span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(attachment.id || name)}
                className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-white"
                aria-label={`删除附件 ${name}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ChatInput({
  value,
  loading,
  onValueChange,
  onSubmit,
  onStatusMessage,
  openAttachmentSignal = 0,
  openCameraSignal = 0
}: ChatInputProps) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);
  const [attachments, setAttachments] = React.useState<ChatAttachmentDraft[]>([]);
  const [listening, setListening] = React.useState(false);
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const attachmentsRef = React.useRef<ChatAttachmentDraft[]>([]);
  const valueRef = React.useRef(value);

  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  async function submitCurrentMessage() {
    const submitted = await onSubmit(attachments);

    if (submitted !== false) {
      setAttachments([]);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCurrentMessage();
  }

  function handleSelectedFiles(event: React.ChangeEvent<HTMLInputElement>, source: ChatAttachmentSource) {
    const files = Array.from(event.currentTarget.files ?? []);

    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    setAttachments((current) => {
      const next = [...current];

      for (const file of files) {
        if (next.length >= MAX_CHAT_ATTACHMENTS) {
          onStatusMessage?.(`附件最多选择 ${MAX_CHAT_ATTACHMENTS} 个。`);
          break;
        }

        const error = validateChatAttachmentFile(file);

        if (error) {
          onStatusMessage?.(`${file.name}：${error}`);
          continue;
        }

        next.push(createChatAttachmentFromFile(file, source));
      }

      return next;
    });

    if (files.length > 0) {
      onStatusMessage?.("附件已添加，会随本次提问一起发送。");
    }
  }

  async function handleVoiceInput() {
    if (loading) {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setInterimTranscript("");
      return;
    }

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      onStatusMessage?.(SPEECH_UNSUPPORTED_MESSAGE);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onStatusMessage?.(SPEECH_UNSUPPORTED_MESSAGE);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setListening(false);
      setInterimTranscript("");
      onStatusMessage?.(getMicrophoneAccessErrorMessage(error));
      return;
    }

    const recognition = new Recognition();

    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const {
        finalTranscript,
        interimTranscript: nextInterimTranscript
      } = readSpeechRecognitionTranscript(event);

      if (finalTranscript) {
        const nextValue = mergeVoiceTranscript(valueRef.current, finalTranscript);

        valueRef.current = nextValue;
        onValueChange(nextValue);
        setInterimTranscript("");
        onStatusMessage?.("语音内容已填入输入框。");
        return;
      }

      setInterimTranscript(nextInterimTranscript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimTranscript("");
      onStatusMessage?.(getSpeechRecognitionErrorMessage(event.error));
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setInterimTranscript("");
      onStatusMessage?.("语音输入启动失败，请使用文字输入或稍后重试。");
    }
  }

  React.useEffect(() => () => {
    recognitionRef.current?.stop();
    cleanupChatAttachments(attachmentsRef.current);
  }, []);

  React.useEffect(() => {
    if (openAttachmentSignal > 0) {
      setAttachmentMenuOpen(true);
    }
  }, [openAttachmentSignal]);

  React.useEffect(() => {
    if (openCameraSignal > 0) {
      cameraInputRef.current?.click();
    }
  }, [openCameraSignal]);

  return (
    <form
      onSubmit={handleSubmit}
      className="z-20 shrink-0 bg-white px-3 pb-5 pt-1"
    >
      {attachmentMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default bg-transparent"
          aria-label="关闭上传菜单"
          onClick={() => setAttachmentMenuOpen(false)}
        />
      ) : null}

      <SelectedAttachmentList
        attachments={attachments}
        onRemove={(attachmentId) => setAttachments((current) => removeChatAttachment(current, attachmentId))}
      />

      <div className="relative flex min-h-[56px] items-center gap-2 rounded-full bg-white px-3 shadow-xl shadow-slate-200/90 ring-1 ring-slate-100">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
          aria-label="打开相机"
        >
          <Camera className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
        </button>

        <Textarea
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitCurrentMessage();
            }
          }}
          placeholder="发消息或按住说话..."
          className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-base font-medium shadow-none placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={loading}
          rows={1}
        />

        <button
          type="button"
          onClick={handleVoiceInput}
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100 data-[listening=true]:bg-blue-600 data-[listening=true]:text-white"
          aria-label={listening ? "停止语音输入" : "语音输入"}
          aria-pressed={listening}
          data-listening={listening}
          title={listening ? "正在听，再次点击停止" : "语音输入"}
        >
          <Mic className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-slate-950 text-slate-950 hover:bg-slate-100"
            aria-label="打开上传菜单"
            aria-expanded={attachmentMenuOpen}
          >
            <Plus className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <AttachmentMenu
            open={attachmentMenuOpen}
            onSelect={() => setAttachmentMenuOpen(false)}
            onPhotoUpload={() => photoInputRef.current?.click()}
            onFileUpload={() => fileInputRef.current?.click()}
            onCameraOpen={() => cameraInputRef.current?.click()}
          />
        </div>
      </div>
      {listening || interimTranscript ? (
        <div className="mt-2 px-3 text-xs font-medium text-blue-600">
          {interimTranscript ? `正在听：${interimTranscript}` : "正在听..."}
        </div>
      ) : null}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleSelectedFiles(event, "gallery")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={CHAT_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => handleSelectedFiles(event, "file")}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleSelectedFiles(event, "camera")}
      />
    </form>
  );
}
