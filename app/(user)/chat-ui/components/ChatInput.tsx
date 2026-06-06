"use client";

import * as React from "react";
import { Brain, Mic, Paperclip, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentMenu } from "./AttachmentMenu";

interface ChatInputProps {
  value: string;
  loading: boolean;
  enableDeepThinking: boolean;
  enableWebSearch: boolean;
  onValueChange: (value: string) => void;
  onToggleDeepThinking: () => void;
  onToggleWebSearch: () => void;
  onSubmit: () => void;
}

export function ChatInput({
  value,
  loading,
  enableDeepThinking,
  enableWebSearch,
  onValueChange,
  onToggleDeepThinking,
  onToggleWebSearch,
  onSubmit
}: ChatInputProps) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur md:px-6 md:py-4"
    >
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/60">
        <Textarea
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="输入你的问题，按 Enter 发送"
          className="min-h-20 resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={loading}
          rows={3}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleDeepThinking}
              className={cn(
                "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
                enableDeepThinking
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              aria-pressed={enableDeepThinking}
            >
              <Brain className="h-4 w-4" aria-hidden="true" />
              深度思考
            </button>
            <button
              type="button"
              onClick={onToggleWebSearch}
              className={cn(
                "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
                enableWebSearch
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              aria-pressed={enableWebSearch}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              智能搜索
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachmentMenuOpen((open) => !open)}
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="打开附件菜单"
                aria-expanded={attachmentMenuOpen}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>
              <AttachmentMenu open={attachmentMenuOpen} />
            </div>
            <button
              type="button"
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="语音输入占位"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              aria-label="发送"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
