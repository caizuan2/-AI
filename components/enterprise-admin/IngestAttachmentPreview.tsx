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
  description: string;
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
    return { label: "图片", description: "图片素材", Icon: FileImage, tone: "bg-[#e8f8ef] text-[#128246]" };
  }

  if (extension === "pdf" || mime.includes("pdf")) {
    return { label: "PDF", description: "PDF 文档", Icon: FileText, tone: "bg-[#fff0f0] text-[#c2413a]" };
  }

  if (["doc", "docx"].includes(extension) || mime.includes("word")) {
    return { label: "Word", description: "Word 文档", Icon: FileText, tone: "bg-[#eaf2ff] text-[#315bf6]" };
  }

  if (["ppt", "pptx"].includes(extension) || mime.includes("presentation")) {
    return { label: "PPT", description: "演示文稿", Icon: Presentation, tone: "bg-[#fff2df] text-[#b45f06]" };
  }

  if (extension === "txt" || mime.includes("text/plain")) {
    return { label: "TXT", description: "文本文件", Icon: FileText, tone: "bg-[#f0f1f3] text-[#475569]" };
  }

  if (extension === "md" || mime.includes("markdown")) {
    return { label: "MD", description: "Markdown", Icon: FileText, tone: "bg-[#f3efff] text-[#6d4aff]" };
  }

  return { label: "文件", description: "附件文件", Icon: File, tone: "bg-[#f0f1f3] text-[#475569]" };
}

function getWrapperClass(fileCount: number, compact: boolean, imageOnly: boolean) {
  if (imageOnly) {
    return compact
      ? "flex max-h-[220px] w-full max-w-[420px] flex-wrap items-end justify-end gap-2 overflow-y-auto"
      : "flex max-h-[108px] flex-nowrap items-start gap-2 overflow-x-auto";
  }

  if (compact) {
    return "flex max-h-[220px] w-full max-w-[420px] flex-col items-end gap-2 overflow-hidden";
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
  compact = false,
  imageOnly = false
}: {
  files: IngestUploadState[];
  onRemove?: (fileId: string) => void;
  compact?: boolean;
  imageOnly?: boolean;
}) {
  if (files.length === 0) {
    return null;
  }

  const visibleLimit = imageOnly ? files.length : files.length > 4 ? 3 : files.length;
  const visibleFiles = files.slice(0, visibleLimit);
  const extraCount = Math.max(0, files.length - visibleFiles.length);

  return (
    <div className={getWrapperClass(files.length, compact, imageOnly)}>
      {visibleFiles.map((file) => {
        const kind = getAttachmentKind(file);
        const isImage = kind.label === "图片";
        const Icon = kind.Icon;
        const imageUrl = file.persistentUrl || file.previewUrl;
        const statusLabel = file.parseStatus === "partial"
          ? "部分解析"
          : statusLabels[file.status];
        const statusTone = file.status === "failed"
          ? "bg-[#fff0f0] text-[#b42318]"
          : file.parseStatus === "partial"
            ? "bg-[#fff6df] text-[#9a5b00]"
            : "bg-[#e9f8ef] text-[#128246]";

        if (imageOnly && isImage) {
          return (
            <div
              key={file.id}
              className={[
                "relative shrink-0 overflow-hidden rounded-2xl bg-[#f6f6f3]",
                compact ? "h-40 w-28" : "h-20 w-20"
              ].join(" ")}
            >
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt=""
                  fill
                  sizes={compact ? "112px" : "80px"}
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#128246]">
                  <FileImage className="h-6 w-6" aria-hidden="true" />
                </div>
              )}
              {onRemove ? (
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => onRemove(file.id)}
                  className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[#777] shadow-sm transition hover:text-[#b93b4a]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        }

        return (
          <div
            key={file.id}
            className={[
              "relative min-w-0 overflow-hidden rounded-2xl border border-[#e7e7e4] bg-white shadow-[0_10px_26px_rgba(15,23,42,0.04)]",
              compact ? "h-16 w-full min-w-[260px] max-w-[420px] p-2.5 pr-3" : "min-h-[74px] p-3"
            ].join(" ")}
          >
            <div className="flex h-full min-w-0 items-center gap-3">
              <div className={["relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl", kind.tone, compact ? "h-11 w-11" : "h-12 w-12"].join(" ")}>
                {isImage && imageUrl ? (
                  <Image src={imageUrl} alt={file.fileName} fill sizes={compact ? "44px" : "48px"} unoptimized className="object-cover" />
                ) : (
                  <Icon className="h-5 w-5 text-current" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1 pr-20">
                <p
                  className="overflow-hidden text-[13px] font-semibold leading-[17px] text-[#202020]"
                  style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
                  title={file.fileName}
                >
                  {file.fileName}
                </p>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[#858580]">
                  <span className="shrink-0">{kind.description}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-[#d1d1cc]" />
                  <span className="truncate">{formatFileSize(file.fileSize)}</span>
                  {file.parseStatus && !compact ? (
                    <>
                      <span className="h-1 w-1 shrink-0 rounded-full bg-[#d1d1cc]" />
                      <span className="truncate">{parseStatusLabels[file.parseStatus]}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <span className={["absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold", statusTone].join(" ")}>
                {statusLabel}
              </span>
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
            compact ? "h-16 w-20" : "h-[74px] min-w-[86px]"
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
