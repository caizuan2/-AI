"use client";

import { Bell, CheckCircle2, X } from "lucide-react";
import type { IngestNotification } from "@/lib/enterprise/ingest-client";

const typeTone: Record<IngestNotification["type"], string> = {
  success: "bg-[#e9f8ef] text-[#128246]",
  file: "bg-[#eef5ff] text-[#2d5fa8]",
  license: "bg-[#fff3d8] text-[#9a6500]",
  tenant: "bg-[#edf0f4] text-[#475569]",
  sync: "bg-[#eef9f3] text-[#128246]",
  fallback: "bg-[#f0f0ee] text-[#555]",
  info: "bg-[#f0f0ee] text-[#555]"
};

export function IngestNotificationPanel({
  open,
  notifications,
  onClose,
  onMarkAllRead
}: {
  open: boolean;
  notifications: IngestNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[70] flex justify-end bg-black/10 p-4">
      <aside className="h-full w-full max-w-[380px] overflow-y-auto rounded-[28px] border border-[#e7e7e4] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#202020]">
              <Bell className="h-4 w-4 text-[#128246]" aria-hidden="true" />
              投喂通知面板
            </div>
            <p className="mt-1 text-xs text-[#888]">最近投喂、文件解析、授权和三端同步提醒。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f3] text-[#555] hover:bg-[#ededeb]" aria-label="关闭通知面板">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onMarkAllRead}
          className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-2xl bg-[#202020] text-xs font-semibold text-white transition hover:bg-black"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          全部标记已读
        </button>

        <div className="mt-4 space-y-3">
          {notifications.map((item) => (
            <article key={item.id} className="rounded-[22px] border border-[#eeeeeb] bg-[#fbfbfa] p-3">
              <div className="flex items-start justify-between gap-3">
                <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", typeTone[item.type]].join(" ")}>{item.type}</span>
                <span className={item.read ? "text-[11px] text-[#aaa]" : "text-[11px] font-semibold text-[#128246]"}>{item.read ? "已读" : "未读"}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-[#202020]">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-[#666]">{item.description}</p>
              <p className="mt-2 text-[11px] text-[#999]">Web / EXE / APK · {new Date(item.createdAt).toLocaleString("zh-CN")}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
