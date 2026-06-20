"use client";

import { IngestAttachmentPreview } from "@/components/enterprise-admin/IngestAttachmentPreview";
import { IngestMessageQuickActions } from "@/components/enterprise-admin/IngestMessageQuickActions";
import type { IngestChatMessage } from "@/lib/enterprise/mock-chat";

export function buildIngestUserMessageCopyText(message: Pick<IngestChatMessage, "content" | "attachments">) {
  const prompt = message.content.trim();
  const files = message.attachments?.length
    ? `文件：${message.attachments.map((file) => file.fileName).join("、")}`
    : "";

  return [files, prompt ? `提示词：${prompt}` : ""].filter(Boolean).join("\n");
}

export function IngestChatGPTFileMessage({
  message,
  agentLabel,
  modelLabel,
  onCopy,
  onEdit
}: {
  message: IngestChatMessage;
  agentLabel: string;
  modelLabel: string;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const prompt = message.content.trim() || "学习与总结一下";

  return (
    <div className="ml-auto flex w-full max-w-[520px] flex-col items-end gap-2">
      {message.attachments?.length ? (
        <div className="w-full rounded-[22px] border border-[#e7e7e4] bg-white p-2 shadow-sm">
          <IngestAttachmentPreview files={message.attachments} compact />
        </div>
      ) : null}

      <div className="max-w-full rounded-[24px] bg-[#202020] px-4 py-3 text-sm leading-6 text-white shadow-sm">
        <p className="whitespace-pre-wrap">{prompt}</p>
      </div>

      <div className="flex max-w-full flex-wrap justify-end gap-2 text-[11px] text-[#777]">
        <span className="rounded-full bg-[#f4f4f2] px-2 py-1">Agent：{agentLabel}</span>
        <span className="rounded-full bg-[#f4f4f2] px-2 py-1">模型：{modelLabel}</span>
        <span className="rounded-full bg-[#f4f4f2] px-2 py-1">Web / EXE / APK</span>
      </div>

      <IngestMessageQuickActions onCopy={onCopy} onEdit={onEdit} tone="light" />
    </div>
  );
}
