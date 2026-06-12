"use client";

import * as React from "react";
import { Bot, FileText, Image as ImageIcon, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerAnswerCard } from "./CustomerAnswerCard";
import { EmptyState } from "./EmptyState";
import { RichAnswerView } from "./RichAnswerView";
import { SourceList } from "./SourceList";
import type { ChatMessageView, ChatMode } from "../types";

interface ChatMessagesProps {
  messages: ChatMessageView[];
  loading: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
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

function getAttachmentPreviewUrl(attachment: UserAttachment) {
  const metadata = attachment.metadata ?? {};

  return (
    getStringValue(attachment.previewUrl) ||
    getStringValue(attachment.url) ||
    getStringValue(attachment.src) ||
    getStringValue(attachment.dataUrl) ||
    getStringValue(metadata.previewUrl) ||
    getStringValue(metadata.url) ||
    getStringValue(metadata.src) ||
    getStringValue(metadata.dataUrl)
  );
}

function isImageAttachment(attachment: UserAttachment) {
  const mimeType = attachment.mimeType || attachment.mime_type || "";
  const previewUrl = getAttachmentPreviewUrl(attachment);

  return (
    attachment.type === "image" ||
    attachment.type === "gallery_photo" ||
    attachment.type === "camera_photo" ||
    mimeType.startsWith("image/") ||
    looksLikeImageUrl(previewUrl)
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
      <div className="max-w-[240px] rounded-2xl bg-white/15 px-3 py-3 text-xs text-blue-50 ring-1 ring-white/20">
        图片加载失败
        <span className="mt-1 block truncate text-blue-100/80">{name}</span>
      </div>
    );
  }

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noreferrer"
      className="block max-w-[240px] overflow-hidden rounded-2xl bg-white/15 text-left text-xs text-blue-50 ring-1 ring-white/20"
      aria-label={`打开图片预览 ${name}`}
    >
      <span className="block max-h-64 overflow-hidden bg-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={name}
          className="max-h-64 w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
      <span className="block truncate px-2.5 py-1.5">{name}</span>
    </a>
  );
}

function UserMessageAttachments({ attachments }: { attachments: ChatMessageView["attachments"] }) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 space-y-2">
      {attachments.map((attachment, index) => {
        const isImage = isImageAttachment(attachment);
        const previewUrl = getAttachmentPreviewUrl(attachment);
        const name = attachment.name || `附件 ${index + 1}`;

        if (isImage && previewUrl) {
          return (
            <UserImageAttachment
              key={attachment.reference_id || attachment.id || `${name}-${index}`}
              name={name}
              previewUrl={previewUrl}
            />
          );
        }

        return (
          <div
            key={attachment.reference_id || attachment.id || `${name}-${index}`}
            className="flex max-w-[240px] items-center gap-2 rounded-2xl bg-white/15 px-2 py-1.5 text-xs text-white"
          >
            {isImage ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              {isImage ? (
                <span className="block truncate text-[11px] text-blue-100/80">图片预览不可用</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ChatMessages({ messages, loading, mode, onModeChange }: ChatMessagesProps) {
  const messagesRef = React.useRef(messages);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    return () => {
      const blobUrls = new Set<string>();

      for (const message of messagesRef.current) {
        for (const attachment of message.attachments ?? []) {
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
              {isUser ? (
                <>
                  <UserMessageAttachments attachments={message.attachments} />
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                </>
              ) : (
                <RichAnswerView
                  answer={message.content}
                  customerAnswer={message.customer_answer}
                  providerStatus={message.provider_status}
                />
              )}
              {message.pending ? (
                <div className="mt-2 text-xs opacity-80">发送中...</div>
              ) : null}
              {!isUser ? (
                <CustomerAnswerCard content={message.customer_answer} />
              ) : null}
              {showSources ? (
                <SourceList sources={message.sources} confidence={message.confidence} />
              ) : null}
              <div className={cn("mt-2 text-xs", isUser ? "text-blue-100" : "text-slate-400")}>
                {formatMessageTime(message.created_at)}
              </div>
            </div>

            {isUser ? (
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                <User className="h-4 w-4" aria-hidden="true" />
              </div>
            ) : null}
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
