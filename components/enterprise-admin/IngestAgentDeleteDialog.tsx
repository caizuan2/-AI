"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export function IngestAgentDeleteDialog({
  agent,
  onClose,
  onConfirm
}: {
  agent: IngestChatAgent | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!agent) {
    return null;
  }

  const canDelete = agent.deletableByIngestAdmin === true;

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/20 px-4">
      <section className="w-full max-w-md rounded-[28px] border border-[#e7e7e4] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={canDelete ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff0f2] text-[#b93b4a]" : "flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff3d8] text-[#9a6500]"}>
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#202020]">删除 Agent</h2>
              <p className="mt-1 text-sm text-[#777]">{agent.name} · {agent.role}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭删除确认" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#eeeeec]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-[#555]">
          {canDelete
            ? "删除 Agent 只会从当前投喂工作台移除，不会删除已保存知识。后续可在后台恢复或重新同步。"
            : "系统分类由超级管理员配置，不能在投喂端删除。"}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl bg-[#f3f3f1] px-4 py-2 text-sm font-semibold text-[#555] hover:bg-[#e9e9e7]">
            取消
          </button>
          <button
            type="button"
            onClick={canDelete ? onConfirm : onClose}
            className={canDelete
              ? "inline-flex items-center gap-2 rounded-2xl bg-[#b93b4a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9f2f3c]"
              : "rounded-2xl bg-[#202020] px-4 py-2 text-sm font-semibold text-white hover:bg-black"}
          >
            {canDelete ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : null}
            {canDelete ? "确认删除" : "我知道了"}
          </button>
        </div>
      </section>
    </div>
  );
}
