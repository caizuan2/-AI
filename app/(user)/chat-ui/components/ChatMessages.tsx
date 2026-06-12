"use client";

import * as React from "react";
import { Bot, Check, Copy, FileText, Image as ImageIcon, Loader2, Pencil, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerAnswerCard } from "./CustomerAnswerCard";
import { EmptyState } from "./EmptyState";
import { RichAnswerView } from "./RichAnswerView";
import { SourceList } from "./SourceList";
import { getCachedChatAttachmentPreviewUrl } from "../chat-ui-state";
import type { ChatMessageView, ChatMode } from "../types";

interface ChatMessagesProps {
  messages: ChatMessageView[];
  loading: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onEditUserMessage?: (content: string) => void;
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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

function shouldShowDebugSources() {
  return process.env.NEXT_PUBLIC_CHAT_UI_DEBUG_SOURCES === "true";
}

type UserAttachment = NonNullable<ChatMessageView["attachments"]>[number];

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeImageUrl(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  const path = normalizedValue.split("?")[0]?.split("#")[0] ?? "";

  return (
    normalizedValue.startsWith("data:image/") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)
  );
}

function normalizeAttachmentImageUrl(value: unknown) {
  const text = getStringValue(value).replace(/\\/g, "/");

  if (!text || text.startsWith("data:") && !text.startsWith("data:image/")) {
    return "";
  }

  if (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("blob:") ||
    text.startsWith("data:image/") ||
    text.startsWith("/")
  ) {
    return text;
  }

  if (looksLikeImageUrl(text)) {
    const normalizedPath = text.replace(/^public\//, "");

    if (normalizedPath.startsWith("uploads/")) {
      return `/${normalizedPath}`;
    }

    const fileName = normalizedPath.split("/").filter(Boolean).at(-1);

    return fileName ? `/uploads/${fileName}` : text;
  }

  return text;
}

function getAttachmentPreviewUrl(attachment: UserAttachment) {
  const metadata = attachment.metadata ?? {};
  const directUrl = (
    normalizeAttachmentImageUrl(attachment.previewUrl) ||
    normalizeAttachmentImageUrl(attachment.url) ||
    normalizeAttachmentImageUrl(attachment.src) ||
    normalizeAttachmentImageUrl(attachment.dataUrl) ||
    normalizeAttachmentImageUrl(attachment.fileUrl) ||
    normalizeAttachmentImageUrl(attachment.publicUrl) ||
    normalizeAttachmentImageUrl(attachment.downloadUrl) ||
    normalizeAttachmentImageUrl(attachment.path) ||
    normalizeAttachmentImageUrl(attachment.storagePath) ||
    normalizeAttachmentImageUrl(metadata.previewUrl) ||
    normalizeAttachmentImageUrl(metadata.url) ||
    normalizeAttachmentImageUrl(metadata.src) ||
    normalizeAttachmentImageUrl(metadata.dataUrl) ||
    normalizeAttachmentImageUrl(metadata.fileUrl) ||
    normalizeAttachmentImageUrl(metadata.publicUrl) ||
    normalizeAttachmentImageUrl(metadata.downloadUrl) ||
    normalizeAttachmentImageUrl(metadata.path) ||
    normalizeAttachmentImageUrl(metadata.storagePath)
  );

  return directUrl || getCachedChatAttachmentPreviewUrl(attachment);
}

export function getUserMessageCopyText(message: Pick<ChatMessageView, "content" | "attachments">) {
  const content = message.content.trim();

  if (content) {
    return content;
  }

  const names = normalizeMessageAttachments(message.attachments)
    .map((attachment, index) => attachment.name || attachment.filename || `附件 ${index + 1}`)
    .filter(Boolean);

  return names.length > 0 ? names.join("\n") : "暂无文字可复制";
}

export async function copyUserMessageToClipboard(content: string, clipboard: Pick<Clipboard, "writeText">) {
  await clipboard.writeText(content);
}

function looksLikeImageFileName(value: string) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(value.trim().split("?")[0]?.split("#")[0] ?? "");
}

function isImageAttachment(attachment: UserAttachment) {
  const mimeType = attachment.mimeType || attachment.mime_type || "";
  const previewUrl = getAttachmentPreviewUrl(attachment);
  const fileName = getStringValue(attachment.name) || getStringValue(attachment.filename);

  return (
    attachment.type === "image" ||
    attachment.type === "gallery_photo" ||
    attachment.type === "camera_photo" ||
    mimeType.startsWith("image/") ||
    looksLikeImageUrl(previewUrl) ||
    looksLikeImageFileName(fileName)
  );
}

function UserImageAttachment({
  name,
  previewUrl
}: {
  name: string;
  previewUrl: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <div className="max-w-[260px] rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-xs font-medium text-slate-500">
        图片加载失败
        <span className="mt-1 block truncate text-slate-400">{name}</span>
      </div>
    );
  }

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noreferrer"
      className="block max-w-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-left text-xs font-medium text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      aria-label={`打开图片预览 ${name}`}
    >
      <span className="block max-h-[260px] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={name}
          className="max-h-[260px] w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
      <span className="block truncate px-2.5 py-1.5">{name}</span>
    </a>
  );
}

function normalizeMessageAttachments(attachments: ChatMessageView["attachments"]): UserAttachment[] {
  const value: unknown = attachments;

  if (Array.isArray(value)) {
    return value as UserAttachment[];
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? parsed as UserAttachment[] : [];
  } catch {
    return [];
  }
}

function UserMessageAttachments({ attachments }: { attachments: ChatMessageView["attachments"] }) {
  const normalizedAttachments = normalizeMessageAttachments(attachments);

  if (normalizedAttachments.length === 0) {
    return null;
  }

  return (
    <div className="grid max-w-[280px] grid-cols-1 justify-items-end gap-2 sm:max-w-[560px] sm:grid-cols-2">
      {normalizedAttachments.map((attachment, index) => {
        const isImage = isImageAttachment(attachment);
        const previewUrl = getAttachmentPreviewUrl(attachment);
        const name = attachment.name || attachment.filename || `附件 ${index + 1}`;

        if (isImage && previewUrl) {
          return (
            <UserImageAttachment
              key={attachment.reference_id || attachment.id || `${name}-${index}`}
              name={name}
              previewUrl={previewUrl}
            />
          );
        }

        const fileSize = formatAttachmentSize(attachment.size);
        const key = attachment.reference_id || attachment.id || `${name}-${index}`;
        const fileCard = (
          <>
            {isImage ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              {fileSize ? (
                <span className="block truncate text-[11px] text-slate-400">{fileSize}</span>
              ) : null}
              {isImage ? (
                <span className="block truncate text-[11px] text-slate-400">图片预览不可用</span>
              ) : !previewUrl ? (
                <span className="block truncate text-[11px] text-slate-400">文件暂不可预览</span>
              ) : null}
            </span>
          </>
        );

        if (previewUrl && !isImage) {
          return (
            <a
              key={key}
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-[260px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              aria-label={`打开文件 ${name}`}
            >
              {fileCard}
            </a>
          );
        }

        return (
          <div
            key={key}
            className="flex max-w-[260px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm"
          >
            {fileCard}
          </div>
        );
      })}
    </div>
  );
}

function UserMessageActions({
  message,
  onEditUserMessage
}: {
  message: ChatMessageView;
  onEditUserMessage?: (content: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    const copyText = getUserMessageCopyText(message);

    if (!navigator.clipboard) {
      return;
    }

    await copyUserMessageToClipboard(copyText, navigator.clipboard);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function handleEdit() {
    onEditUserMessage?.(message.content);
  }

  return (
    <div className="flex items-center justify-end gap-2 pr-1">
      <button
        type="button"
        onClick={handleCopy}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="复制用户消息"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? "已复制" : "复制"}
      </button>
      <button
        type="button"
        onClick={handleEdit}
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="编辑用户消息"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        编辑
      </button>
    </div>
  );
}

function UserMessageBlock({
  message,
  onEditUserMessage
}: {
  message: ChatMessageView;
  onEditUserMessage?: (content: string) => void;
}) {
  const content = message.content.trim();

  return (
    <>
      <div className="flex min-w-0 max-w-[min(760px,88%)] flex-col items-end gap-2 text-sm leading-7">
        <UserMessageAttachments attachments={message.attachments} />
        {content ? (
          <div className="max-w-full rounded-3xl rounded-br-lg bg-blue-600 px-4 py-3 text-white shadow-sm">
            <div className="whitespace-pre-wrap break-words">{content}</div>
            {message.pending ? (
              <div className="mt-2 text-xs text-blue-100">发送中...</div>
            ) : null}
            <div className="mt-2 text-xs text-blue-100">{formatMessageTime(message.created_at)}</div>
          </div>
        ) : (
          <div className="pr-1 text-xs text-slate-400">{formatMessageTime(message.created_at)}</div>
        )}
        <UserMessageActions message={message} onEditUserMessage={onEditUserMessage} />
      </div>
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
        <User className="h-4 w-4" aria-hidden="true" />
      </div>
    </>
  );
}

export function ChatMessages({ messages, loading, mode, onModeChange, onEditUserMessage }: ChatMessagesProps) {
  const messagesRef = React.useRef(messages);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    return () => {
      const blobUrls = new Set<string>();

      for (const message of messagesRef.current) {
        for (const attachment of normalizeMessageAttachments(message.attachments)) {
          const previewUrl = getAttachmentPreviewUrl(attachment);

          if (previewUrl.startsWith("blob:")) {
            blobUrls.add(previewUrl);
          }
        }
      }

      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  if (messages.length === 0) {
    return <EmptyState mode={mode} onModeChange={onModeChange} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 md:px-6">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const showSources = !isUser && shouldShowDebugSources();

        return (
          <article
            key={message.id}
            className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
          >
            {isUser ? (
              <UserMessageBlock message={message} onEditUserMessage={onEditUserMessage} />
            ) : (
              <>
            {!isUser ? (
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
            ) : null}

            <div
              className={cn(
                "max-w-[min(760px,88%)] rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm",
                isUser
                  ? "rounded-br-lg bg-blue-600 text-white"
                  : "rounded-bl-lg border border-slate-200 bg-white text-slate-900"
              )}
            >
              <RichAnswerView
                answer={message.content}
                customerAnswer={message.customer_answer}
                providerStatus={message.provider_status}
              />
              {message.pending ? (
                <div className="mt-2 text-xs opacity-80">发送中...</div>
              ) : null}
              <CustomerAnswerCard content={message.customer_answer} />
              {showSources ? (
                <SourceList sources={message.sources} confidence={message.confidence} />
              ) : null}
              <div className="mt-2 text-xs text-slate-400">
                {formatMessageTime(message.created_at)}
              </div>
            </div>
              </>
            )}
          </article>
        );
      })}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </span>
          AI 正在检索知识库并生成回答...
        </div>
      ) : null}
    </div>
  );
}
