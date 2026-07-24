"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { File, FileImage, FileText, Presentation, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import type { IngestUploadState } from "@/lib/enterprise/ingest-client";

const MIN_PREVIEW_SCALE = 0.5;
const MAX_PREVIEW_SCALE = 3;
const PREVIEW_SCALE_STEP = 0.25;

type ImagePreviewState = {
  fileName: string;
  url: string;
};

function clampPreviewScale(value: number) {
  return Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, value));
}

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
  imageOnly = false,
  enableImagePreview = false,
  composerThumbnailLayout = false
}: {
  files: IngestUploadState[];
  onRemove?: (fileId: string) => void;
  compact?: boolean;
  imageOnly?: boolean;
  enableImagePreview?: boolean;
  composerThumbnailLayout?: boolean;
}) {
  const [previewImage, setPreviewImage] = useState<ImagePreviewState | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previousPreviewScaleRef = useRef(1);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const closeImagePreview = useCallback(() => {
    previousPreviewScaleRef.current = 1;
    setPreviewImage(null);
    setPreviewScale(1);
  }, []);

  const openImagePreview = useCallback((file: IngestUploadState, imageUrl: string) => {
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    previousPreviewScaleRef.current = 1;
    setPreviewScale(1);
    setPreviewImage({
      fileName: file.fileName,
      url: imageUrl
    });
  }, []);

  const updatePreviewScale = useCallback((delta: number) => {
    setPreviewScale((current) => clampPreviewScale(current + delta));
  }, []);

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const focusableElements = Array.from(
          toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements.at(-1);

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeImagePreview();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updatePreviewScale(PREVIEW_SCALE_STEP);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        updatePreviewScale(-PREVIEW_SCALE_STEP);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        setPreviewScale(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocusedElementRef.current?.focus();
    };
  }, [closeImagePreview, previewImage, updatePreviewScale]);

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const scrollContainer = previewScrollRef.current;
    const previousScale = previousPreviewScaleRef.current;
    previousPreviewScaleRef.current = previewScale;

    if (!scrollContainer || previousScale === previewScale) {
      return;
    }

    const previousScrollLeft = scrollContainer.scrollLeft;
    const previousScrollTop = scrollContainer.scrollTop;
    const scaleRatio = previewScale / previousScale;
    const animationFrame = window.requestAnimationFrame(() => {
      scrollContainer.scrollLeft = Math.max(
        0,
        (previousScrollLeft + scrollContainer.clientWidth / 2) * scaleRatio
          - scrollContainer.clientWidth / 2
      );
      scrollContainer.scrollTop = Math.max(0, previousScrollTop * scaleRatio);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [previewImage, previewScale]);

  if (files.length === 0) {
    return null;
  }

  const visibleLimit = imageOnly ? files.length : files.length > 4 ? 3 : files.length;
  const visibleFiles = files.slice(0, visibleLimit);
  const extraCount = Math.max(0, files.length - visibleFiles.length);

  return (
    <>
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
                "relative shrink-0 overflow-hidden bg-[#f3f3f1]",
                composerThumbnailLayout
                  ? "h-16 w-14 rounded-xl"
                  : compact
                    ? "h-40 w-28 rounded-2xl"
                    : "h-20 w-20 rounded-2xl"
              ].join(" ")}
            >
              {imageUrl && enableImagePreview ? (
                <button
                  type="button"
                  aria-label={`放大查看 ${file.fileName}`}
                  title="点击放大查看"
                  onClick={() => openImagePreview(file, imageUrl)}
                  className={[
                    "group absolute inset-0 cursor-zoom-in overflow-hidden",
                    composerThumbnailLayout ? "rounded-xl" : "rounded-2xl"
                  ].join(" ")}
                >
                  <Image
                    src={imageUrl}
                    alt={file.fileName}
                    fill
                    sizes={compact ? "112px" : "80px"}
                    unoptimized
                    className={[
                      "object-contain transition duration-200 group-hover:scale-[1.03]",
                      composerThumbnailLayout ? "p-1.5" : ""
                    ].join(" ")}
                  />
                  {!composerThumbnailLayout ? (
                    <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ZoomIn className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              ) : imageUrl ? (
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
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(file.id);
                  }}
                  className={[
                    "absolute z-10 flex items-center justify-center rounded-full shadow-sm transition",
                    composerThumbnailLayout
                      ? "right-0.5 top-0.5 h-5 w-5 bg-[#202020] text-white hover:bg-black"
                      : "right-1.5 top-1.5 h-6 w-6 bg-white/95 text-[#777] hover:text-[#b93b4a]"
                  ].join(" ")}
                >
                  <X className={composerThumbnailLayout ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
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
                {isImage && imageUrl && enableImagePreview ? (
                  <button
                    type="button"
                    aria-label={`放大查看 ${file.fileName}`}
                    title="点击放大查看"
                    onClick={() => openImagePreview(file, imageUrl)}
                    className="group absolute inset-0 cursor-zoom-in overflow-hidden rounded-xl"
                  >
                    <Image
                      src={imageUrl}
                      alt={file.fileName}
                      fill
                      sizes={compact ? "44px" : "48px"}
                      unoptimized
                      className="object-cover transition duration-200 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ZoomIn className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                ) : isImage && imageUrl ? (
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

      {enableImagePreview && previewImage ? (
        <div
          className="fixed inset-0 z-[120] bg-black/90 p-4 pt-20 sm:p-8 sm:pt-20"
          role="dialog"
          aria-modal="true"
          aria-label={`图片预览：${previewImage.fileName}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeImagePreview();
            }
          }}
        >
          <div
            ref={toolbarRef}
            className="absolute left-1/2 top-4 z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-full bg-black/75 p-1.5 text-white shadow-2xl backdrop-blur"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="缩小图片"
              title="缩小（-）"
              disabled={previewScale <= MIN_PREVIEW_SCALE}
              onClick={() => updatePreviewScale(-PREVIEW_SCALE_STEP)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-14 px-1 text-center text-xs font-semibold tabular-nums" aria-live="polite">
              {Math.round(previewScale * 100)}%
            </span>
            <button
              type="button"
              aria-label="放大图片"
              title="放大（+）"
              disabled={previewScale >= MAX_PREVIEW_SCALE}
              onClick={() => updatePreviewScale(PREVIEW_SCALE_STEP)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="恢复图片原始缩放"
              title="恢复 100%（0）"
              disabled={previewScale === 1}
              onClick={() => setPreviewScale(1)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭图片预览"
              title="关闭（Esc）"
              onClick={closeImagePreview}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/15 sm:h-9 sm:w-9"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={previewScrollRef}
            className="h-full w-full overflow-auto"
          >
            <div
              className="relative"
              style={{
                height: `${Math.max(1, previewScale) * 100}%`,
                width: `${Math.max(1, previewScale) * 100}%`
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeImagePreview();
                }
              }}
            >
              <div
                className="absolute"
                style={previewScale >= 1
                  ? { inset: 0 }
                  : {
                      height: `${previewScale * 100}%`,
                      width: `${previewScale * 100}%`,
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)"
                    }}
                onClick={(event) => {
                  const image = event.currentTarget.querySelector("img");
                  const bounds = event.currentTarget.getBoundingClientRect();

                  if (!image?.naturalWidth || !image.naturalHeight || bounds.width <= 0 || bounds.height <= 0) {
                    event.stopPropagation();
                    return;
                  }

                  const containScale = Math.min(
                    bounds.width / image.naturalWidth,
                    bounds.height / image.naturalHeight
                  );
                  const renderedWidth = image.naturalWidth * containScale;
                  const renderedHeight = image.naturalHeight * containScale;
                  const renderedLeft = (bounds.width - renderedWidth) / 2;
                  const renderedTop = (bounds.height - renderedHeight) / 2;
                  const clickX = event.clientX - bounds.left;
                  const clickY = event.clientY - bounds.top;
                  const clickedVisibleImage = (
                    clickX >= renderedLeft
                    && clickX <= renderedLeft + renderedWidth
                    && clickY >= renderedTop
                    && clickY <= renderedTop + renderedHeight
                  );

                  if (clickedVisibleImage) {
                    event.stopPropagation();
                    return;
                  }

                  closeImagePreview();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onDoubleClick={() => setPreviewScale((current) => current === 1 ? 2 : 1)}
              >
                <Image
                  src={previewImage.url}
                  alt={previewImage.fileName}
                  fill
                  sizes="100vw"
                  unoptimized
                  priority
                  className="select-none object-contain"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
