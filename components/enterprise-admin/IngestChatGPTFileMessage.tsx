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
    <div className="ml-auto flex w-full max-w-[860px] flex-col items-end gap-2">
      {message.attachments?.length ? (
        <div className="flex w-full justify-end">
          <IngestAttachmentPreview files={message.attachments} imageOnly enableImagePreview />
        </div>
      ) : null}

      <div className="max-w-full rounded-[24px] bg-[#202020] px-4 py-3 text-sm leading-6 text-white shadow-sm">
        <p className="whitespace-pre-wrap">{prompt}</p>
      </div>

      <IngestMessageQuickActions onCopy={onCopy} onEdit={onEdit} tone="light" />
    </div>
  );
}
