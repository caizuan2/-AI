"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, Plus, SendHorizontal, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentMenu } from "./AttachmentMenu";
import { rememberChatAttachmentPreviewUrl } from "../chat-ui-state";
import type { ChatAttachmentDraft, ChatAttachmentSource, AttachmentType } from "../types";

interface ChatInputProps {
  value: string;
  loading: boolean;
  placeholder?: string;
  onValueChange: (value: string) => void;
  onSubmit: (attachments?: ChatAttachmentDraft[]) => Promise<boolean> | boolean | void;
  onCancel?: () => void;
  onStatusMessage?: (message: string) => void;
  onAttachmentsChange?: (attachments: ChatAttachmentDraft[]) => void;
  answerModelSelector?: React.ReactNode;
  knowledgeBaseSelector?: React.ReactNode;
}

export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_SIZE_MB = 100;
export const MAX_CHAT_ATTACHMENT_SIZE_BYTES = MAX_CHAT_ATTACHMENT_SIZE_MB * 1024 * 1024;
export const CHAT_FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,image/*";

const imageAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateChatAttachmentFile(file: File) {
  if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    return `单个附件不能超过 ${MAX_CHAT_ATTACHMENT_SIZE_MB}MB。`;
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
  const attachment = {
    id,
    type: getAttachmentType(file, source),
    source,
    name: file.name,
    mime_type: file.type || "application/octet-stream",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    reference_id: id,
    previewUrl,
    file,
    metadata: {
      source
    }
  };

  rememberChatAttachmentPreviewUrl(attachment);

  return attachment;
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

function isImageAttachmentDraft(attachment: ChatAttachmentDraft) {
  const mimeType = attachment.mime_type || attachment.mimeType || "";

  return (
    attachment.type === "image" ||
    attachment.type === "gallery_photo" ||
    attachment.type === "camera_photo" ||
    mimeType.startsWith("image/")
  );
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
    <div className="mb-2 flex max-w-full gap-2 overflow-x-auto px-1 pb-1">
      {attachments.map((attachment, index) => {
        const isImage = isImageAttachmentDraft(attachment);
        const name = attachment.name || `附件 ${index + 1}`;

        return (
          <div
            key={attachment.id || `${name}-${index}`}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500"
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden bg-white">
              {attachment.previewUrl && isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : isImage ? (
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(attachment.id || name)}
                className="focus-ring absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-bl-lg bg-slate-900/80 text-white shadow-sm transition hover:bg-slate-950"
                aria-label={`删除附件 ${index + 1}`}
                title="删除附件"
              >
                <X className="h-3 w-3" aria-hidden="true" />
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
  placeholder = "问问 小董AI",
  onValueChange,
  onSubmit,
  onCancel,
  onStatusMessage,
  onAttachmentsChange,
  answerModelSelector,
  knowledgeBaseSelector
}: ChatInputProps) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);
  const [attachments, setAttachments] = React.useState<ChatAttachmentDraft[]>([]);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const attachmentMenuRootRef = React.useRef<HTMLDivElement | null>(null);
  const attachmentsRef = React.useRef<ChatAttachmentDraft[]>([]);
  const hasText = value.trim().length > 0;
  const hasImageAttachment = attachments.some(isImageAttachmentDraft);
  const canSend = (hasText || hasImageAttachment) && !loading;

  const resizeTextarea = React.useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 40), 176);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 176 ? "auto" : "hidden";
  }, []);

  React.useEffect(() => {
    attachmentsRef.current = attachments;
    onAttachmentsChange?.(attachments);
  }, [attachments, onAttachmentsChange]);

  React.useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  React.useEffect(() => {
    if (!attachmentMenuOpen) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      const menuRoot = attachmentMenuRootRef.current;
      const target = event.target;

      if (menuRoot && target instanceof Node && !menuRoot.contains(target)) {
        setAttachmentMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [attachmentMenuOpen]);

  async function submitCurrentMessage() {
    const submittedAttachments = attachmentsRef.current;
    const shouldClearOptimistically = canSend && submittedAttachments.length > 0;

    if (shouldClearOptimistically) {
      setAttachments([]);
    }

    const submitted = await onSubmit(submittedAttachments);

    if (submitted === false) {
      if (shouldClearOptimistically) {
        setAttachments((current) => (current.length === 0 ? submittedAttachments : current));
      }

      return;
    }

    if (!shouldClearOptimistically) {
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

  React.useEffect(() => () => {
    cleanupChatAttachments(attachmentsRef.current);
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="z-20 shrink-0 bg-white px-3 pb-5 pt-1"
      style={{
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))"
      }}
    >
      <SelectedAttachmentList
        attachments={attachments}
        onRemove={(attachmentId) => setAttachments((current) => removeChatAttachment(current, attachmentId))}
      />

      <div className="relative flex min-h-[56px] items-end gap-2 rounded-[28px] bg-white px-3 py-1.5 shadow-xl shadow-slate-200/90 ring-1 ring-slate-100">
        <div ref={attachmentMenuRootRef} className="relative">
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
            aria-label="打开上传菜单"
            aria-expanded={attachmentMenuOpen}
          >
            <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <AttachmentMenu
            open={attachmentMenuOpen}
            onSelect={() => setAttachmentMenuOpen(false)}
            onPhotoUpload={() => photoInputRef.current?.click()}
            onFileUpload={() => fileInputRef.current?.click()}
            onCameraOpen={() => cameraInputRef.current?.click()}
          />
        </div>

        {answerModelSelector}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitCurrentMessage();
            }
          }}
          placeholder={placeholder}
          className="max-h-44 min-h-10 min-w-0 flex-1 resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2.5 text-base font-medium leading-6 shadow-none [overflow-wrap:anywhere] placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={loading}
          rows={1}
          wrap="soft"
        />

        {knowledgeBaseSelector}

        <button
          type="button"
          onClick={() => {
            if (loading) {
              onCancel?.();
              return;
            }

            void submitCurrentMessage();
          }}
          disabled={!loading && !canSend}
          className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400 transition enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed data-[loading=true]:bg-slate-950 data-[loading=true]:text-white data-[loading=true]:hover:bg-slate-800"
          aria-label={loading ? "停止生成" : "发送消息"}
          data-loading={loading}
        >
          {loading ? (
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <SendHorizontal className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>
      </div>
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
        multiple
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
