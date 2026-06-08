"use client";

import * as React from "react";
import { ImagePlus, RotateCcw, Save, X } from "lucide-react";
import { getChatUserAvatarStorageKey } from "../chat-ui-state";
import { updateCurrentUserAvatar } from "../api";
import type { CurrentChatUser } from "../types";

export const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function validateAvatarFile(file: File) {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return "头像仅支持 jpg、jpeg、png、webp 图片。";
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    return "头像大小不能超过 2MB。";
  }

  return null;
}

interface AvatarSettingsDialogProps {
  open: boolean;
  user: CurrentChatUser | null;
  userName: string;
  userAccount: string;
  avatarUrl: string | null;
  onClose: () => void;
  onSaved: (avatarUrl: string | null) => void;
}

export function AvatarSettingsDialog({
  open,
  user,
  userName,
  userAccount,
  avatarUrl,
  onClose,
  onSaved
}: AvatarSettingsDialogProps) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(avatarUrl);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [restoreDefault, setRestoreDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setPreviewUrl(avatarUrl);
      setSelectedFile(null);
      setRestoreDefault(false);
      setSaving(false);
      setError(null);
    }
  }, [avatarUrl, open]);

  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!open) {
    return null;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const nextError = validateAvatarFile(file);

    if (nextError) {
      setError(nextError);
      return;
    }

    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRestoreDefault(false);
    setError(null);
  }

  function handleRestoreDefault() {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedFile(null);
    setRestoreDefault(true);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      if (restoreDefault) {
        window.localStorage.removeItem(getChatUserAvatarStorageKey(user));
        onSaved(null);
        onClose();
        return;
      }

      if (!selectedFile) {
        onClose();
        return;
      }

      const result = await updateCurrentUserAvatar(selectedFile);

      window.localStorage.setItem(getChatUserAvatarStorageKey(user), result.avatar_url);
      onSaved(result.avatar_url);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "头像保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/30 px-4 py-5 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">修改头像</h2>
            <p className="mt-1 text-xs text-slate-500">
              {userName}
              {userAccount ? ` · ${userAccount}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="取消"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-3xl font-bold text-slate-500 ring-1 ring-slate-200">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="当前头像预览" className="h-full w-full object-cover" />
            ) : (
              <span aria-label="当前头像预览">{userName.slice(0, 1) || "用"}</span>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">当前头像预览</p>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            上传新头像
          </button>
          <button
            type="button"
            onClick={handleRestoreDefault}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            恢复默认头像
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="focus-ring inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            取消
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
