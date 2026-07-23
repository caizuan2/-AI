"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Link2Off, X } from "lucide-react";
import { copyAdminIngestText } from "@/lib/enterprise/admin-ingest-clipboard";

export interface IngestConversationLinkDialogState {
  conversationId: string;
  kind: "share" | "group";
  title: string;
  url: string;
}

export function IngestConversationLinkDialog({
  state,
  busy,
  onClose,
  onRevoke
}: {
  state: IngestConversationLinkDialogState | null;
  busy: boolean;
  onClose: () => void;
  onRevoke: (state: IngestConversationLinkDialogState) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCopyState("idle");
  }, [state?.url]);

  if (!state) {
    return null;
  }

  async function copyLink() {
    const copied = await copyAdminIngestText(state?.url ?? "");

    if (copied) {
      setCopyState("copied");
      return;
    }

    linkInputRef.current?.focus();
    linkInputRef.current?.select();
    setCopyState("manual");
  }

  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[26px] border border-[#e8e8e5] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#202020]">
              {state.kind === "share" ? "分享链接" : "群聊邀请链接"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#777]">
              {state.kind === "share"
                ? "链接只展示当前对话中可见的提问与回答正文。"
                : "持有链接的人可以查看对话正文，并以昵称参与当前群聊。"}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭链接弹窗"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#777] transition hover:bg-[#f3f3f1] hover:text-[#202020]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-[#f6f6f4] p-3">
          <p className="truncate text-xs font-semibold text-[#333]">{state.title}</p>
          <input
            ref={linkInputRef}
            readOnly
            value={state.url}
            aria-label={state.kind === "share" ? "分享链接" : "群聊邀请链接"}
            className="mt-2 h-10 w-full rounded-xl border border-[#dededb] bg-white px-3 text-xs text-[#555] outline-none"
            onFocus={(event) => event.currentTarget.select()}
          />
          {copyState !== "idle" ? (
            <p
              aria-live="polite"
              className={[
                "mt-2 text-xs",
                copyState === "copied" ? "text-[#128246]" : "text-[#9a6500]"
              ].join(" ")}
            >
              {copyState === "copied"
                ? "链接已复制"
                : "浏览器未允许自动复制，链接已选中，请按 Ctrl+C。"}
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#202020] text-xs font-semibold text-white transition hover:bg-black"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            复制链接
          </button>
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dededb] text-xs font-semibold text-[#333] transition hover:bg-[#f7f7f5]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            打开链接
          </a>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRevoke(state)}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[#b42318] transition hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2Off className="h-4 w-4" aria-hidden="true" />
          {busy ? "正在关闭..." : state.kind === "share" ? "停止分享" : "关闭群聊"}
        </button>
      </div>
    </div>
  );
}
