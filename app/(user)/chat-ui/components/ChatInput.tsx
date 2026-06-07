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
}

export function ChatInput({
  value,
  loading,
  onValueChange,
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
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
          aria-label="语音输入占位"
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
          <AttachmentMenu open={attachmentMenuOpen} onSelect={() => setAttachmentMenuOpen(false)} />
        </div>
      </div>
    </form>
  );
}
