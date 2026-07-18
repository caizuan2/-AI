"use client";

import * as React from "react";
import { Check, Copy, FileText, Image as ImageIcon, Pencil, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeVisibleText } from "@/lib/ai-chat/visible-output-sanitizer";
import { ChatMessageRenderer } from "@/app/(user)/app/components/chat/message-renderer";
import { submitChatBehaviorFeedback, type ChatBehaviorFeedbackInput } from "../api";
import { EmptyState } from "./EmptyState";
import { safeCopyTextDetailed } from "../lib/clipboard";
import {
  getCachedChatAttachmentPreviewUrl,
  getCurrentChatUserAvatarUrl,
  getCurrentChatUserInitial
} from "../chat-ui-state";
import type { ChatMessageView, ChatMode, CurrentChatUser } from "../types";

interface ChatMessagesProps {
  messages: ChatMessageView[];
  loading: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onEditUserMessage?: (content: string) => void;
  currentUser?: CurrentChatUser | null;
  userName?: string | null;
  userAvatarUrl?: string | null;
  focusMessageId?: string | null;
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

type UserAttachment = NonNullable<ChatMessageView["attachments"]>[number];

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getBooleanValue(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

const localPublicAttachmentFileNamePattern = /^[A-Za-z0-9_-]+-\d{10,}-[A-Fa-f0-9-]+\.[A-Za-z0-9]+$/;

function looksLikeImageUrl(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  const path = normalizedValue.split("?")[0]?.split("#")[0] ?? "";

  return (
    normalizedValue.startsWith("data:image/") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)
  );
}

function getUrlPath(value: string) {
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  }

  return value.split("?")[0]?.split("#")[0] ?? "";
}

function normalizeAttachmentImageUrl(value: unknown) {
  const text = getStringValue(value).replace(/\\/g, "/");

  if (!text || (text.startsWith("data:") && !text.startsWith("data:image/"))) {
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

  return "";
}

function normalizeLocalPublicAttachmentDownloadUrl(value: unknown) {
  const text = getStringValue(value).replace(/\\/g, "/");

  if (!text || text.startsWith("blob:") || text.startsWith("data:")) {
    return "";
  }

  const path = getUrlPath(text);
  const fileName = path.match(/(?:^|\/)uploads\/chat-attachments\/([^/?#]+)$/i)?.[1];

  if (fileName) {
    return `/api/ai/chat/attachments/download?key=${encodeURIComponent(fileName)}`;
  }

  return localPublicAttachmentFileNamePattern.test(text)
    ? `/api/ai/chat/attachments/download?key=${encodeURIComponent(text)}`
    : "";
}

function normalizeAttachmentDownloadUrl(value: unknown) {
  const text = getStringValue(value).replace(/\\/g, "/");

  if (
    !text ||
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("blob:") ||
    text.startsWith("data:") ||
    text.startsWith("/")
  ) {
    return "";
  }

  return `/api/ai/chat/attachments/download?key=${encodeURIComponent(text)}`;
}

function normalizeBlobAttachmentDownloadUrl(value: unknown) {
  const text = getStringValue(value).replace(/\\/g, "/");

  return text.includes("/") ? normalizeAttachmentDownloadUrl(text) : "";
}

function appendUnique(values: string[], value: string) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

export function getAttachmentPreviewUrls(attachment: UserAttachment) {
  const metadata = getRecordValue(attachment.metadata);
  const record = getRecordValue(attachment);
  const urls: string[] = [];
  const pushImageUrl = (value: unknown) => appendUnique(urls, normalizeAttachmentImageUrl(value));
  const pushDownloadUrl = (value: unknown) => appendUnique(urls, normalizeAttachmentDownloadUrl(value));
  const pushLocalPublicDownloadUrl = (value: unknown) => appendUnique(urls, normalizeLocalPublicAttachmentDownloadUrl(value));

  [
    attachment.previewUrl,
    attachment.url,
    attachment.publicUrl,
    attachment.fileUrl,
    attachment.downloadUrl,
    attachment.src,
    attachment.dataUrl,
    attachment.path,
    metadata.url,
    metadata.publicUrl,
    metadata.fileUrl,
    metadata.downloadUrl,
    metadata.previewUrl,
    metadata.src,
    metadata.dataUrl,
    metadata.path
  ].forEach((value) => {
    pushImageUrl(value);
    pushLocalPublicDownloadUrl(value);
  });

  [
    attachment.storagePath,
    record.storageKey,
    record.blobKey,
    record.key,
    metadata.storagePath,
    metadata.storageKey,
    metadata.blobKey,
    metadata.key
  ].forEach((value) => {
    pushImageUrl(value);
    pushDownloadUrl(value);
    pushLocalPublicDownloadUrl(value);
  });

  [
    attachment.reference_id,
    record.referenceId,
    record.reference_id,
    metadata.referenceId,
    metadata.reference_id
  ].forEach((value) => {
    appendUnique(urls, normalizeBlobAttachmentDownloadUrl(value));
    pushLocalPublicDownloadUrl(value);
  });

  appendUnique(urls, getCachedChatAttachmentPreviewUrl(attachment) || "");

  return urls;
}

export function getUserMessageCopyText(message: Pick<ChatMessageView, "content" | "attachments">) {
  const content = sanitizeVisibleText(message.content.trim());

  if (content) {
    return content;
  }

  const names = normalizeMessageAttachments(message.attachments)
    .filter((attachment) => !isImageAttachment(attachment))
    .map((attachment, index) => attachment.name || attachment.filename || `附件 ${index + 1}`)
    .filter(Boolean);

  return names.length > 0 ? names.join("\n") : "暂无文字可复制";
}

export async function copyUserMessageToClipboard(content: string, clipboard: Pick<Clipboard, "writeText">) {
  await clipboard.writeText(content);
}

function looksLikeImageFileName(value: unknown) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(getStringValue(value).split("?")[0]?.split("#")[0] ?? "");
}

function isImageAttachment(attachment: UserAttachment) {
  const mimeType = attachment.mimeType || attachment.mime_type || "";
  const metadata = getRecordValue(attachment.metadata);
  const record = getRecordValue(attachment);
  const previewUrls = getAttachmentPreviewUrls(attachment);
  const fileName = getStringValue(attachment.name) || getStringValue(attachment.filename);

  return (
    attachment.type === "image" ||
    attachment.type === "gallery_photo" ||
    attachment.type === "camera_photo" ||
    mimeType.startsWith("image/") ||
    previewUrls.some(looksLikeImageUrl) ||
    looksLikeImageFileName(fileName) ||
    looksLikeImageFileName(attachment.storagePath) ||
    looksLikeImageFileName(record.storageKey) ||
    looksLikeImageFileName(record.blobKey) ||
    looksLikeImageFileName(record.key) ||
    looksLikeImageFileName(metadata.storagePath) ||
    looksLikeImageFileName(metadata.storageKey) ||
    looksLikeImageFileName(metadata.blobKey) ||
    looksLikeImageFileName(metadata.key)
  );
}

function UserImageAttachment({
  index,
  previewUrls,
  compact
}: {
  index: number;
  previewUrls: string[];
  compact: boolean;
}) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [failed, setFailed] = React.useState(previewUrls.length === 0);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const fallbackKey = previewUrls.join("\n");
  const previewUrl = previewUrls[activeIndex] ?? "";

  React.useEffect(() => {
    setActiveIndex(0);
    setFailed(previewUrls.length === 0);
    setPreviewOpen(false);
  }, [fallbackKey, previewUrls.length]);

  React.useEffect(() => {
    if (!previewOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  function handleImageError() {
    if (activeIndex + 1 < previewUrls.length) {
      setActiveIndex((index) => index + 1);
      return;
    }

    setFailed(true);
    setPreviewOpen(false);
  }

  if (failed || !previewUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-white/40 bg-white/90 px-3 py-3 text-center text-xs font-medium text-slate-500 shadow-sm",
          compact ? "h-24 w-24 sm:h-28 sm:w-28" : "max-w-[min(220px,62vw)] sm:max-w-[260px]"
        )}
      >
        <span>
          <ImageIcon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />
          图片预览不可用
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={cn(
          "block overflow-hidden rounded-2xl border border-white/40 bg-white/90 text-left text-xs font-medium text-slate-500 shadow-sm transition hover:border-white hover:bg-white",
          compact ? "h-24 w-24 sm:h-28 sm:w-28" : "max-w-[min(220px,62vw)] sm:max-w-[260px]"
        )}
        aria-label={`打开图片预览 ${index + 1}`}
        data-chat-image-thumbnail="true"
        data-fallback-count={previewUrls.length}
      >
        <span
          className={cn(
            "block overflow-hidden bg-slate-100",
            compact ? "h-full w-full" : "max-h-[260px] max-w-[min(220px,62vw)] sm:max-w-[260px]"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className={cn(
              compact ? "h-full w-full object-cover" : "max-h-[260px] max-w-[min(220px,62vw)] object-contain sm:max-w-[260px]"
            )}
            onError={handleImageError}
          />
        </span>
      </button>
      {previewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setPreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-2 text-sm font-medium text-slate-900 shadow-lg transition hover:bg-white"
            aria-label="关闭图片预览"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewOpen(false);
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            关闭
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="图片预览"
            className="max-h-[88vh] max-w-[92vw] rounded-lg bg-white object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onError={handleImageError}
          />
        </div>
      ) : null}
    </>
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

  const compact = normalizedAttachments.length > 1;

  return (
    <div
      className={cn(
        "grid justify-items-end gap-1.5",
        compact
          ? "max-w-[min(220px,68vw)] grid-cols-2 sm:max-w-[352px]"
          : "max-w-[min(220px,62vw)] grid-cols-1 sm:max-w-[260px]",
        normalizedAttachments.length > 4 ? "sm:grid-cols-3" : null
      )}
      data-chat-attachment-grid={compact ? "multi" : "single"}
    >
      {normalizedAttachments.map((attachment, index) => {
        const isImage = isImageAttachment(attachment);
        const previewUrls = getAttachmentPreviewUrls(attachment);
        const previewUrl = previewUrls[0] ?? "";
        const name = attachment.name || attachment.filename || `附件 ${index + 1}`;

        if (isImage && previewUrl) {
          return (
            <UserImageAttachment
              key={attachment.reference_id || attachment.id || `${name}-${index}`}
              index={index}
              previewUrls={previewUrls}
              compact={compact}
            />
          );
        }

        if (isImage) {
          return (
            <div
              key={attachment.reference_id || attachment.id || `${name}-${index}`}
              className={cn(
                "flex items-center justify-center rounded-2xl border border-white/40 bg-white/90 px-3 py-3 text-center text-xs font-medium text-slate-500 shadow-sm",
                compact ? "h-24 w-24 sm:h-28 sm:w-28" : "max-w-[min(220px,62vw)] sm:max-w-[260px]"
              )}
            >
              <span>
                <ImageIcon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />
                图片预览不可用
              </span>
            </div>
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

function UserMessageBubble({
  message,
  content
}: {
  message: ChatMessageView;
  content: string;
}) {
  const hasAttachments = normalizeMessageAttachments(message.attachments).length > 0;

  if (!hasAttachments && !content) {
    return message.pending ? (
      <div className="max-w-full rounded-3xl rounded-br-lg bg-blue-600 px-4 py-3 text-white shadow-sm">
        <div className="text-xs text-blue-100">发送中...</div>
      </div>
    ) : null;
  }

  if (!hasAttachments) {
    return (
      <div className="max-w-full rounded-3xl rounded-br-lg bg-blue-600 px-4 py-3 text-white shadow-sm">
        <div className="whitespace-pre-wrap break-words">{content}</div>
        {message.pending ? (
          <div className="mt-2 text-xs text-blue-100">发送中...</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="max-w-full rounded-3xl rounded-br-lg bg-blue-600 p-2 text-white shadow-sm"
      data-chat-user-message-bubble="attachments"
    >
      <UserMessageAttachments attachments={message.attachments} />
      {content ? (
        <div className="mt-2 whitespace-pre-wrap break-words px-2 py-1.5 leading-7">{content}</div>
      ) : null}
      {message.pending ? (
        <div className={cn("px-2 text-xs text-blue-100", content ? "mt-1" : "mt-2")}>发送中...</div>
      ) : null}
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
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "manual" | "failed">("idle");
  const [copyStatusMessage, setCopyStatusMessage] = React.useState("");
  const selectionRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleCopy() {
    const copyText = getUserMessageCopyText(message);

    const result = await safeCopyTextDetailed(copyText, { selectTarget: selectionRef.current });

    if (result.copied) {
      setCopyState("copied");
      setCopyStatusMessage(result.message);
      window.setTimeout(() => setCopyState("idle"), 1200);
      return;
    }

    if (result.selected) {
      setCopyState("manual");
      setCopyStatusMessage(result.message);
      window.setTimeout(() => setCopyState("idle"), 2400);
      return;
    }

    setCopyState("failed");
    setCopyStatusMessage(result.message);
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  function handleEdit() {
    onEditUserMessage?.(message.content);
  }

  const copyLabel = copyState === "copied"
    ? "已复制"
    : copyState === "manual"
      ? "已选中"
      : copyState === "failed"
        ? "复制失败"
        : "复制";

  return (
    <>
      <textarea
        ref={selectionRef}
        value={getUserMessageCopyText(message)}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />
      <div className="flex items-center justify-end gap-2 pr-1">
        <button
          type="button"
          onClick={handleCopy}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="复制用户消息"
          title={copyStatusMessage || "复制用户消息"}
        >
          {copyState === "copied" || copyState === "manual" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copyLabel}
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
    </>
  );
}

function UserMessageBlock({
  message,
  onEditUserMessage,
  currentUser,
  userAvatarUrl
}: {
  message: ChatMessageView;
  onEditUserMessage?: (content: string) => void;
  currentUser?: CurrentChatUser | null;
  userAvatarUrl?: string | null;
}) {
  const content = sanitizeVisibleText(message.content.trim());
  const messageTime = formatMessageTime(message.created_at);

  return (
    <>
      <div className="flex min-w-0 max-w-[min(760px,88%)] flex-col items-end gap-2 text-sm leading-7">
        {messageTime ? (
          <div className="mb-1 pr-1 text-right text-[11px] leading-none text-slate-400">
            {messageTime}
          </div>
        ) : null}
        <UserMessageBubble message={message} content={content} />
        <UserCommercialIntentBadge message={message} />
        <UserMessageActions message={message} onEditUserMessage={onEditUserMessage} />
      </div>
      <UserMessageAvatar currentUser={currentUser} userAvatarUrl={userAvatarUrl} />
    </>
  );
}

function UserCommercialIntentBadge({ message }: { message: ChatMessageView }) {
  void message;

  return null;
}

function UserMessageAvatar({
  currentUser,
  userAvatarUrl
}: {
  currentUser?: CurrentChatUser | null;
  userAvatarUrl?: string | null;
}) {
  const avatarUrl = userAvatarUrl || getCurrentChatUserAvatarUrl(currentUser);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !failed) {
    return (
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-bold text-slate-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt="当前用户头像"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (currentUser) {
    return (
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white" aria-label="当前用户默认头像">
        {getCurrentChatUserInitial(currentUser)}
      </div>
    );
  }

  return (
    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white" aria-label="当前用户默认头像">
      <User className="h-4 w-4" aria-hidden="true" />
    </div>
  );
}

export function ChatMessages({
  messages,
  mode,
  onModeChange,
  onEditUserMessage,
  currentUser = null,
  userName = null,
  userAvatarUrl = null,
  focusMessageId = null
}: ChatMessagesProps) {
  const messagesRef = React.useRef(messages);
  const dwellReportedRef = React.useRef(new Set<string>());
  const clickReportedRef = React.useRef(new Set<string>());
  const copyReportedRef = React.useRef(new Set<string>());
  const dwellTimersRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    const dwellTimers = dwellTimersRef.current;

    return () => {
      const blobUrls = new Set<string>();

      for (const message of messagesRef.current) {
        for (const attachment of normalizeMessageAttachments(message.attachments)) {
          const previewUrls = getAttachmentPreviewUrls(attachment);

          for (const previewUrl of previewUrls) {
            if (previewUrl.startsWith("blob:")) {
              blobUrls.add(previewUrl);
            }
          }
        }
      }

      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      dwellTimers.forEach((timer) => window.clearTimeout(timer));
      dwellTimers.clear();
    };
  }, []);

  const reportAssistantBehavior = React.useCallback((
    message: ChatMessageView,
    eventType: ChatBehaviorFeedbackInput["eventType"],
    overrides: Partial<ChatBehaviorFeedbackInput> = {}
  ) => {
    if (message.role !== "assistant" || message.pending) {
      return;
    }

    const metadata = getRecordValue(message.metadata);
    const seed = getRecordValue(metadata.behaviorFeedbackSeed);
    const responseId = getStringValue(metadata.responseId) || message.id;
    const query = getStringValue(metadata.userQuery);

    void submitChatBehaviorFeedback({
      userId: currentUser?.id ?? null,
      query,
      responseId,
      eventType,
      clickCount: 0,
      copyCount: 0,
      dwellTime: 0,
      followUp: getBooleanValue(seed.followUp),
      converted: getBooleanValue(seed.converted),
      metadata: {
        messageId: message.id,
        confidence: message.confidence ?? null,
        hasCustomerAnswer: Boolean(message.customer_answer),
        providerStatus: message.provider_status ?? null
      },
      ...overrides
    }).catch(() => undefined);
  }, [currentUser?.id]);

  React.useEffect(() => {
    for (const message of messages) {
      if (
        message.role !== "assistant" ||
        message.pending ||
        !message.content.trim() ||
        dwellReportedRef.current.has(message.id) ||
        dwellTimersRef.current.has(message.id)
      ) {
        continue;
      }

      const timer = window.setTimeout(() => {
        dwellReportedRef.current.add(message.id);
        dwellTimersRef.current.delete(message.id);
        reportAssistantBehavior(message, "dwellTime", {
          dwellTime: 8000
        });
      }, 8000);

      dwellTimersRef.current.set(message.id, timer);
    }
  }, [messages, reportAssistantBehavior]);

  function handleAssistantClickCapture(event: React.MouseEvent<HTMLElement>, message: ChatMessageView) {
    if (!clickReportedRef.current.has(message.id)) {
      clickReportedRef.current.add(message.id);
      reportAssistantBehavior(message, "click", {
        clickCount: 1
      });
    }

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button");
    const buttonText = `${button?.getAttribute("aria-label") ?? ""} ${button?.textContent ?? ""}`;

    if (/复制/.test(buttonText) && !copyReportedRef.current.has(message.id)) {
      copyReportedRef.current.add(message.id);
      reportAssistantBehavior(message, "copy", {
        copyCount: 1
      });
    }
  }

  if (messages.length === 0) {
    return <EmptyState mode={mode} onModeChange={onModeChange} userName={userName} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 md:px-6">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const previousUserMessage = !isUser
          ? [...messages.slice(0, index)].reverse().find((item) => item.role === "user")
          : null;

        return (
          <article
            key={message.id}
            data-chat-message-id={message.id}
            data-chat-message-role={message.role}
            className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
            onClickCapture={isUser ? undefined : (event) => handleAssistantClickCapture(event, message)}
          >
            {isUser ? (
              <UserMessageBlock
                message={message}
                onEditUserMessage={onEditUserMessage}
                currentUser={currentUser}
                userAvatarUrl={userAvatarUrl}
              />
            ) : (
              <ChatMessageRenderer message={message} userQuery={previousUserMessage?.content ?? null} />
            )}
          </article>
        );
      })}

      {focusMessageId ? (
        <div
          aria-hidden="true"
          data-chat-focus-spacer={focusMessageId}
          className="min-h-[calc(100vh-18rem)] shrink-0"
        />
      ) : null}

    </div>
  );
}
