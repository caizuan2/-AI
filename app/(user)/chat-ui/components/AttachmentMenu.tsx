"use client";

import * as React from "react";
import { Camera, FileText, Image, Upload } from "lucide-react";

interface AttachmentMenuProps {
  open: boolean;
  onSelect?: () => void;
  onPhotoUpload?: () => void;
  onFileUpload?: () => void;
  onCameraOpen?: () => void;
}

const items = [
  {
    key: "photo",
    label: "上传手机照片",
    description: "从相册选择图片",
    icon: Image
  },
  {
    key: "file",
    label: "上传文件",
    description: "选择文档或图片",
    icon: FileText
  },
  {
    key: "camera",
    label: "打开相机",
    description: "拍摄一张照片",
    icon: Camera
  }
];

export function AttachmentMenu({
  open,
  onSelect,
  onPhotoUpload,
  onFileUpload,
  onCameraOpen
}: AttachmentMenuProps) {
  if (!open) {
    return null;
  }

  function handleSelect(key: string) {
    if (key === "photo") {
      onPhotoUpload?.();
    } else if (key === "file") {
      onFileUpload?.();
    } else if (key === "camera") {
      onCameraOpen?.();
    }

    onSelect?.();
  }

  return (
    <div className="absolute bottom-14 left-0 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        上传入口
      </div>
      <div className="mt-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleSelect(item.key)}
              className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
              aria-label={`${item.label}，${item.description}`}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                <span className="text-xs text-slate-500">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
