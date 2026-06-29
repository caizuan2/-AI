"use client";

import { ImagePlus, KeyRound, LogOut, PencilLine, RefreshCw, UserCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type {
  IngestConnectionStatus,
  IngestGptHealthStatus,
  IngestPlatform,
  IngestUploadState,
  IngestVoiceState
} from "@/lib/enterprise/ingest-client";
import { DEFAULT_ADMIN_INGEST_ASSISTANT_NAME } from "@/lib/enterprise/admin-ingest-profile";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export interface IngestSettingsState {
  autoSaveStructuredResult: boolean;
  uploadPreference: "composer" | "queue";
  localPreviewMode: boolean;
  platform: IngestPlatform;
  syncTarget: Array<"web" | "exe" | "apk">;
}

type IngestSettingsAccountAction = "password" | "switch" | "logout";

export function IngestSettingsPanel({
  open,
  adminAvatar,
  appName,
  onAvatarChange,
  onAppNameChange,
  onAccountAction,
  onClose
}: {
  open: boolean;
  activeAgent: IngestChatAgent;
  selectedModel: string;
  connectionStatus: IngestConnectionStatus;
  uploadedFiles: IngestUploadState[];
  voiceState: IngestVoiceState;
  settingsState: IngestSettingsState;
  adminAvatar: string;
  appName: string;
  gptHealthStatus: IngestGptHealthStatus | null;
  isCheckingGptStatus: boolean;
  onSettingsChange: (nextState: IngestSettingsState) => void;
  onAvatarChange: (nextAvatar: string) => void;
  onAppNameChange: (nextName: string) => void;
  onAccountAction: (action: IngestSettingsAccountAction) => void;
  onCheckGptStatus: () => void;
  onReconnectGpt: () => void;
  onClose: () => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [draftAppName, setDraftAppName] = useState(appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
  const [isEditingName, setIsEditingName] = useState(false);
  const [panelMessage, setPanelMessage] = useState("");

  useEffect(() => {
    setDraftAppName(appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
  }, [appName]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        onAvatarChange(reader.result);
        setPanelMessage("头像已更新。");
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function saveAppName(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalizedName = draftAppName.trim() || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;

    setDraftAppName(normalizedName);
    setIsEditingName(false);
    setPanelMessage("名称已更新。");
    onAppNameChange(normalizedName);
  }

  const displayName = draftAppName.trim() || appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;

  return (
    <div className="pointer-events-none absolute inset-0 z-[70]">
      <button
        type="button"
        aria-label="关闭账号设置"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />

      <aside className="pointer-events-auto absolute bottom-16 left-3 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/70">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <UserCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-950">账号信息</h2>
              <p className="text-xs text-slate-500">投喂端账号设置</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="关闭设置面板"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-white text-xl shadow-sm">
              {adminAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={adminAvatar} alt="账号头像" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">AI</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">当前投喂端账号</p>
              <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                投喂管理员
              </p>
            </div>
          </div>
        </section>

        <div className="mt-2 space-y-1">
          <AccountMenuButton
            icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}
            label="修改头像"
            onClick={() => avatarInputRef.current?.click()}
          />
          <AccountMenuButton
            icon={<PencilLine className="h-4 w-4" aria-hidden="true" />}
            label="修改名称"
            onClick={() => {
              setIsEditingName((next) => !next);
              setPanelMessage("");
            }}
          />
          {isEditingName ? (
            <form className="rounded-xl bg-slate-50 p-2" onSubmit={saveAppName}>
              <label className="sr-only" htmlFor="ingest-admin-account-name">
                投喂端名称
              </label>
              <input
                id="ingest-admin-account-name"
                value={draftAppName}
                onChange={(event) => setDraftAppName(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="输入投喂端名称"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                  onClick={() => {
                    setDraftAppName(appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
                    setIsEditingName(false);
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  保存
                </button>
              </div>
            </form>
          ) : null}
          <AccountMenuButton
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            label="修改密码"
            onClick={() => {
              setPanelMessage("密码修改功能将在账号中心接入后启用。");
              onAccountAction("password");
            }}
          />
          <AccountMenuButton
            icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            label="切换账号"
            onClick={() => onAccountAction("switch")}
          />
          <AccountMenuButton
            icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
            label="退出登录"
            danger
            onClick={() => onAccountAction("logout")}
          />
        </div>

        {panelMessage ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{panelMessage}</p>
        ) : null}

        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFileChange}
        />
      </aside>
    </div>
  );
}

function AccountMenuButton({
  icon,
  label,
  danger = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
        danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
      ].join(" ")}
      onClick={onClick}
    >
      <span
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          danger ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
        ].join(" ")}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
