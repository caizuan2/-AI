"use client";

import type { ComponentType } from "react";
import { File, FileImage, FileText, Presentation, X } from "lucide-react";
import Image from "next/image";
import type { IngestUploadState } from "@/lib/enterprise/ingest-client";

const statusLabels: Record<IngestUploadState["status"], string> = {
  selected: "已选择",
  pending_parse: "待发送",
  ready_to_send: "待发送",
  parsing: "解析中",
  attached: "已加入投喂",
  parsed: "已完成",
  failed: "解析失败"
};

const parseStatusLabels: Record<NonNullable<IngestUploadState["parseStatus"]>, string> = {
  parsed: "已解析正文",
  partial: "部分解析",
  metadata_only: "仅元数据",
  unsupported: "暂不支持",
  ocr_pending: "待 OCR"
};

type AttachmentKind = {
  label: "PDF" | "Word" | "PPT" | "图片" | "TXT" | "MD" | "文件";
  Icon: ComponentType<{ className?: string }>;
  tone: string;
};

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "大小未知";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function readExtension(fileName: string) {
  const cleanName = fileName.toLowerCase();
  const dotIndex = cleanName.lastIndexOf(".");

  return dotIndex >= 0 ? cleanName.slice(dotIndex + 1) : "";
}

function getAttachmentKind(file: IngestUploadState): AttachmentKind {
  const extension = readExtension(file.fileName);
  const mime = file.fileType.toLowerCase();

  if (file.isImage || mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) {
    return { label: "图片", Icon: FileImage, tone: "bg-[#e8f8ef] text-[#128246]" };
  }

  if (extension === "pdf" || mime.includes("pdf")) {
    return { label: "PDF", Icon: FileText, tone: "bg-[#fff0f0] text-[#c2413a]" };
  }

  if (["doc", "docx"].includes(extension) || mime.includes("word")) {
    return { label: "Word", Icon: FileText, tone: "bg-[#eaf2ff] text-[#315bf6]" };
  }

  if (["ppt", "pptx"].includes(extension) || mime.includes("presentation")) {
    return { label: "PPT", Icon: Presentation, tone: "bg-[#fff2df] text-[#b45f06]" };
  }

  if (extension === "txt" || mime.includes("text/plain")) {
    return { label: "TXT", Icon: FileText, tone: "bg-[#f0f1f3] text-[#475569]" };
  }

  if (extension === "md" || mime.includes("markdown")) {
    return { label: "MD", Icon: FileText, tone: "bg-[#f3efff] text-[#6d4aff]" };
  }

  return { label: "文件", Icon: File, tone: "bg-[#f0f1f3] text-[#475569]" };
}

function getWrapperClass(fileCount: number, compact: boolean) {
  if (compact) {
    return "flex max-h-[156px] max-w-full flex-wrap items-stretch gap-2 overflow-hidden";
  }

  if (fileCount <= 1) {
    return "grid max-h-[108px] grid-cols-1 gap-2 overflow-hidden";
  }

  if (fileCount === 2) {
    return "grid max-h-[108px] grid-cols-2 gap-2 overflow-hidden";
  }

  return "grid max-h-[112px] grid-cols-2 gap-2 overflow-hidden md:grid-cols-4";
}

export function IngestAttachmentPreview({
  files,
  onRemove,
  compact = false
}: {
  files: IngestUploadState[];
  onRemove?: (fileId: string) => void;
  compact?: boolean;
}) {
  if (files.length === 0) {
    return null;
  }

  const visibleLimit = files.length > 4 ? 3 : files.length;
  const visibleFiles = files.slice(0, visibleLimit);
  const extraCount = Math.max(0, files.length - visibleFiles.length);

  return (
    <div className={getWrapperClass(files.length, compact)}>
      {visibleFiles.map((file) => {
        const kind = getAttachmentKind(file);
        const isImage = kind.label === "图片";
        const Icon = kind.Icon;

        return (
          <div
            key={file.id}
            className={[
              "relative min-w-0 overflow-hidden rounded-2xl border border-[#e7e7e4] bg-[#fbfbfa] shadow-sm",
              compact ? "h-[74px] w-[148px] shrink-0 p-2" : "h-[86px] p-2.5"
            ].join(" ")}
          >
            <div className="flex h-full min-w-0 items-center gap-2">
              <div className={["relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white", compact ? "h-12 w-12" : "h-14 w-14"].join(" ")}>
                {isImage && file.previewUrl ? (
                  <Image src={file.previewUrl} alt={file.fileName} fill sizes={compact ? "48px" : "56px"} unoptimized className="object-cover" />
                ) : (
                  <Icon className="h-5 w-5 text-[#60646c]" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex min-w-0 items-center gap-1.5">
                  <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none", kind.tone].join(" ")}>
                    {kind.label}
                  </span>
                  <span className="truncate text-xs font-semibold text-[#202020]">{file.fileName}</span>
                </div>
                <p className="truncate text-[11px] text-[#858580]">{formatFileSize(file.fileSize)}</p>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[#128246]">{statusLabels[file.status]}</span>
                  {file.parseStatus ? <span className="truncate rounded-full bg-white px-2 py-0.5 text-[#777]">{parseStatusLabels[file.parseStatus]}</span> : null}
                  {!compact ? <span className="truncate rounded-full bg-white px-2 py-0.5 text-[#777]">Web / EXE / APK</span> : null}
                </div>
              </div>
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`移除 ${file.fileName}`}
                  onClick={() => onRemove(file.id)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#777] shadow-sm transition hover:text-[#b93b4a]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {extraCount > 0 ? (
        <button
          type="button"
          className={[
            "flex shrink-0 items-center justify-center rounded-2xl border border-dashed border-[#d9d9d4] bg-[#f3f3f1] text-sm font-bold text-[#555] shadow-sm",
            compact ? "h-[74px] w-[74px]" : "h-[86px] min-w-[86px]"
          ].join(" ")}
          title={`还有 ${extraCount} 个附件`}
          aria-label={`还有 ${extraCount} 个附件`}
        >
          +{extraCount}
        </button>
      ) : null}
    </div>
  );
}
