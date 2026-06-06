"use client";

import * as React from "react";
import { Camera, FileText, Image, Mic, Upload } from "lucide-react";

interface AttachmentMenuProps {
  open: boolean;
}

const items = [
  {
    label: "上传文件",
    description: "本轮仅占位",
    icon: FileText
  },
  {
    label: "拍照",
    description: "相机入口占位",
    icon: Camera
  },
  {
    label: "相册",
    description: "图片入口占位",
    icon: Image
  },
  {
    label: "语音",
    description: "语音识别占位",
    icon: Mic
  }
];

export function AttachmentMenu({ open }: AttachmentMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute bottom-14 left-0 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        附件入口
      </div>
      <div className="mt-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
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
