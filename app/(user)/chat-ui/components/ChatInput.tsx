"use client";

import * as React from "react";
import { Camera, Mic, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentMenu } from "./AttachmentMenu";

interface ChatInputProps {
  value: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStatusMessage?: (message: string) => void;
}

type SpeechRecognitionResultLike = {
  readonly 0: {
    transcript: string;
  };
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

export function ChatInput({
  value,
  loading,
  onValueChange,
  onSubmit,
  onStatusMessage
}: ChatInputProps) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function handleSelectedFile(event: React.ChangeEvent<HTMLInputElement>, label: string) {
    const file = event.currentTarget.files?.[0];

    if (file) {
      onStatusMessage?.(`已选择${label}：${file.name}。当前入口已打开，文件解析和上传将在后续接入。`);
    }

    event.currentTarget.value = "";
  }

  function handleVoiceInput() {
    if (loading) {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      onStatusMessage?.("当前浏览器暂不支持语音输入。");
      return;
    }

    const recognition = new Recognition();

    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();

      if (transcript) {
        onValueChange(value ? `${value}${value.endsWith(" ") ? "" : " "}${transcript}` : transcript);
        onStatusMessage?.("语音内容已填入输入框。");
      }
    };
    recognition.onerror = () => {
      setListening(false);
      onStatusMessage?.("语音输入失败，请稍后重试。");
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  React.useEffect(() => () => recognitionRef.current?.stop(), []);

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
              onSubmit();
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
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
          aria-label={listening ? "停止语音输入" : "语音输入"}
          aria-pressed={listening}
        >
          <Mic className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-950 text-slate-950 hover:bg-slate-100"
            aria-label="打开上传菜单"
            aria-expanded={attachmentMenuOpen}
          >
            <Plus className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
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
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleSelectedFile(event, "手机照片")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,image/*,audio/*,video/*"
        className="hidden"
        onChange={(event) => handleSelectedFile(event, "文件")}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleSelectedFile(event, "相机照片")}
      />
    </form>
  );
}
