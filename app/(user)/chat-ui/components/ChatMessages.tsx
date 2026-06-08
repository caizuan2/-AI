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

function UserMessageAttachments({ attachments }: { attachments: ChatMessageView["attachments"] }) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {attachments.map((attachment, index) => {
        const isImage = attachment.type === "image" || attachment.type === "gallery_photo" || attachment.type === "camera_photo";
        const name = attachment.name || `附件 ${index + 1}`;

        return (
          <div
            key={attachment.reference_id || attachment.id || `${name}-${index}`}
            className="flex items-center gap-2 rounded-2xl bg-white/15 px-2 py-1.5 text-xs text-white"
          >
            {isImage ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChatMessages({ messages, loading, mode, onModeChange }: ChatMessagesProps) {
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
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  <UserMessageAttachments attachments={message.attachments} />
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
