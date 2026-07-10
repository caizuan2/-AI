"use client";

import * as React from "react";
import { Camera, Image, Paperclip } from "lucide-react";

interface AttachmentMenuProps {
  open: boolean;
  onSelect?: () => void;
  onPhotoUpload?: () => void;
  onFileUpload?: () => void;
  onCameraOpen?: () => void;
}

const items = [
  {
    key: "camera",
    label: "相机",
    icon: Camera
  },
  {
    key: "photo",
    label: "照片",
    icon: Image
  },
  {
    key: "file",
    label: "文件",
    icon: Paperclip
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
    <div className="absolute bottom-14 left-0 z-30 w-56 rounded-[28px] border border-slate-100 bg-white p-3 shadow-2xl shadow-slate-200/80">
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleSelect(item.key)}
              className="focus-ring flex w-full items-center gap-4 rounded-2xl px-2.5 py-3 text-left transition hover:bg-slate-50"
              aria-label={item.label}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-950">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="text-base font-semibold text-slate-950">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
