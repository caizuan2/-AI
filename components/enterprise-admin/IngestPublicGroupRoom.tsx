"use client";

import { FormEvent, useEffect, useState } from "react";
import type {
  AdminIngestPublicConversationRecord,
  AdminIngestPublicGroupMessage,
  AdminIngestPublicMessage
} from "@/lib/enterprise/admin-ingest-public-conversation-data";

type PublicGroupSnapshot = Pick<
  AdminIngestPublicConversationRecord,
  "token" | "kind" | "title" | "updatedAt" | "messages" | "groupMessages"
>;

function formatGroupTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1_000);
  const pad = (part: number) => String(part).padStart(2, "0");

  return [
    `${chinaTime.getUTCFullYear()}-${pad(chinaTime.getUTCMonth() + 1)}-${pad(chinaTime.getUTCDate())}`,
    `${pad(chinaTime.getUTCHours())}:${pad(chinaTime.getUTCMinutes())}`
  ].join(" ");
}

export function IngestPublicGroupRoom({
  initial
}: {
  initial: PublicGroupSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [nickname, setNickname] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("admin-ingest-public-group-nickname");

    if (saved) {
      setNickname(saved);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/public/admin-ingest-conversations/${encodeURIComponent(initial.token)}`, {
        cache: "no-store"
      }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const payload = await response.json() as { data?: PublicGroupSnapshot };

      if (payload.data?.kind === "group") {
        setSnapshot(payload.data);
      }
    }, 3_000);

    return () => window.clearInterval(timer);
  }, [initial.token]);

  async function sendGroupMessage(event: FormEvent) {
    event.preventDefault();
    const nextNickname = nickname.trim();
    const nextContent = content.trim();

    if (!nextNickname || !nextContent || sending) {
      setMessage(!nextNickname ? "请输入昵称。" : !nextContent ? "请输入群聊内容。" : "");
      return;
    }

    setSending(true);
    setMessage("");

    try {
      const response = await fetch(`/api/public/admin-ingest-conversations/${encodeURIComponent(initial.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nextNickname,
          content: nextContent
        })
      });
      const payload = await response.json() as { data?: PublicGroupSnapshot; message?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message || "群聊消息发送失败。");
      }

      window.localStorage.setItem("admin-ingest-public-group-nickname", nextNickname);
      setSnapshot(payload.data);
      setContent("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "群聊消息发送失败。");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f3] px-4 py-8 text-[#202020]">
      <div className="mx-auto w-full max-w-3xl">
        <header className="rounded-[28px] border border-[#e7e7e3] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#128246]">投喂端群聊</p>
          <h1 className="mt-2 text-2xl font-semibold">{snapshot.title}</h1>
          <p className="mt-2 text-sm text-[#777]">群聊只包含创建链接时可见的问答正文和下方群聊消息。</p>
        </header>

        <section className="mt-5 space-y-3">
          {snapshot.messages.map((item: AdminIngestPublicMessage) => (
            <article
              key={item.id}
              className={[
                "rounded-[24px] border p-5 shadow-sm",
                item.role === "assistant"
                  ? "border-[#e2ece5] bg-[#f8fcf9]"
                  : "border-[#e7e7e3] bg-white"
              ].join(" ")}
            >
              <p className="text-xs font-semibold text-[#777]">{item.role === "assistant" ? "回答" : "提问"}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{item.content}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-[28px] border border-[#e7e7e3] bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">群聊消息</h2>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
            {snapshot.groupMessages.length === 0 ? (
              <p className="rounded-2xl bg-[#f6f6f4] px-4 py-6 text-center text-sm text-[#888]">还没有群聊消息。</p>
            ) : snapshot.groupMessages.map((item: AdminIngestPublicGroupMessage) => (
              <div key={item.id} className="rounded-2xl bg-[#f6f6f4] px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-[#888]">
                  <span className="font-semibold text-[#444]">{item.nickname}</span>
                  <time dateTime={item.createdAt}>{formatGroupTimestamp(item.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.content}</p>
              </div>
            ))}
          </div>

          <form className="mt-4 grid gap-3" onSubmit={(event) => void sendGroupMessage(event)}>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={30}
              placeholder="你的昵称"
              className="h-11 rounded-2xl border border-[#dededb] px-4 text-sm outline-none focus:border-[#9acaae]"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={2_000}
              rows={3}
              placeholder="输入群聊内容"
              className="resize-none rounded-2xl border border-[#dededb] px-4 py-3 text-sm outline-none focus:border-[#9acaae]"
            />
            {message ? <p className="text-sm text-[#b42318]">{message}</p> : null}
            <button
              type="submit"
              disabled={sending}
              className="h-11 rounded-2xl bg-[#202020] text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "发送中..." : "发送群聊消息"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
