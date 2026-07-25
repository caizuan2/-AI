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
import type { IngestAccessTier } from "@/lib/enterprise/ingest-access-policy";
import { DEFAULT_ADMIN_INGEST_ASSISTANT_NAME } from "@/lib/enterprise/admin-ingest-profile";
import type { AdminIngestPasswordChangeInput } from "@/lib/enterprise/admin-ingest-account-security-client";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export interface IngestSettingsState {
  autoSaveStructuredResult: boolean;
  uploadPreference: "composer" | "queue";
  localPreviewMode: boolean;
  platform: IngestPlatform;
  syncTarget: Array<"web" | "exe" | "apk">;
}

type IngestSettingsAccountAction = "switch" | "logout";

export function resolveIngestAccountIdentityLabel(accessTier: IngestAccessTier) {
  if (accessTier === "chat_only") {
    return "VIP会员";
  }

  if (accessTier === "full_ingest") {
    return "投喂GLY";
  }

  return "未激活";
}

export function normalizeIngestRegisteredAccount(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "未获取注册账号";
  }

  const compact = trimmed.replace(/[\s()-]/g, "");
  const countryCodeMatch = compact.match(/^(?:\+86|0086)(\d{11})$/);

  if (countryCodeMatch) {
    return countryCodeMatch[1];
  }

  if (/^86\d{11}$/.test(compact)) {
    return compact.slice(2);
  }

  return /^\d+$/.test(compact) ? compact : trimmed;
}

function readPanelErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }

  const normalizedMessage = `${error.name} ${error.message}`.toLowerCase();

  if (
    normalizedMessage.includes("quotaexceeded")
    || normalizedMessage.includes("exceeded the quota")
    || normalizedMessage.includes("setting the value of")
  ) {
    return "浏览器旧缓存空间不足，已自动忽略本地缓存；服务器永久数据不受影响。";
  }

  return error.message;
}

export function IngestSettingsPanel({
  open,
  adminAvatar,
  appName,
  accessTier,
  registeredAccount,
  onAvatarChange,
  onAppNameChange,
  onPasswordChange,
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
  accessTier: IngestAccessTier;
  registeredAccount: string;
  gptHealthStatus: IngestGptHealthStatus | null;
  isCheckingGptStatus: boolean;
  onSettingsChange: (nextState: IngestSettingsState) => void;
  onAvatarChange: (file: File) => Promise<void>;
  onAppNameChange: (nextName: string) => Promise<void>;
  onPasswordChange: (input: AdminIngestPasswordChangeInput) => Promise<void>;
  onAccountAction: (action: IngestSettingsAccountAction) => void;
  onCheckGptStatus: () => void;
  onReconnectGpt: () => void;
  onClose: () => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [draftAppName, setDraftAppName] = useState(appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    setIsSavingAvatar(true);
    setPanelMessage("");

    try {
      await onAvatarChange(file);
      setPanelMessage("头像已永久保存。");
    } catch (error) {
      setPanelMessage(readPanelErrorMessage(error, "头像保存失败，请重试。"));
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function saveAppName(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalizedName = draftAppName.trim() || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;

    setIsSavingName(true);
    setPanelMessage("");

    try {
      await onAppNameChange(normalizedName);
      setDraftAppName(normalizedName);
      setIsEditingName(false);
      setPanelMessage("名称已永久保存。");
    } catch (error) {
      setPanelMessage(readPanelErrorMessage(error, "名称保存失败，请重试。"));
    } finally {
      setIsSavingName(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPanelMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPanelMessage("当前密码、新密码和确认密码不能为空。");
      return;
    }

    if (newPassword.length < 8) {
      setPanelMessage("新密码至少需要 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPanelMessage("两次输入的新密码不一致。");
      return;
    }

    if (currentPassword === newPassword) {
      setPanelMessage("新密码不能与当前密码相同。");
      return;
    }

    setIsSavingPassword(true);

    try {
      await onPasswordChange({
        currentPassword,
        newPassword,
        confirmPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPanelMessage("密码已修改，请使用新密码重新登录。");
    } catch (error) {
      setPanelMessage(readPanelErrorMessage(error, "密码修改失败，请重试。"));
    } finally {
      setIsSavingPassword(false);
    }
  }

  const displayName = draftAppName.trim() || appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME;
  const normalizedRegisteredAccount = normalizeIngestRegisteredAccount(registeredAccount);
  const identityLabel = resolveIngestAccountIdentityLabel(accessTier);

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
              <p
                className="mt-0.5 truncate text-xs text-slate-500"
                title={normalizedRegisteredAccount}
              >
                {normalizedRegisteredAccount}
              </p>
              <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                {identityLabel}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-2 space-y-1">
          <AccountMenuButton
            icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}
            label={isSavingAvatar ? "正在保存头像" : "修改头像"}
            disabled={isSavingAvatar}
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
                maxLength={20}
                disabled={isSavingName}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="输入投喂端名称"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                  disabled={isSavingName}
                  onClick={() => {
                    setDraftAppName(appName || DEFAULT_ADMIN_INGEST_ASSISTANT_NAME);
                    setIsEditingName(false);
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingName}
                  className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingName ? "保存中" : "保存"}
                </button>
              </div>
            </form>
          ) : null}
          <AccountMenuButton
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            label={isSavingPassword ? "正在修改密码" : "修改密码"}
            disabled={isSavingPassword}
            onClick={() => {
              setIsEditingPassword((next) => !next);
              setPanelMessage("");
            }}
          />
          {isEditingPassword ? (
            <form className="space-y-2 rounded-xl bg-slate-50 p-2" onSubmit={savePassword}>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">当前密码</span>
                <input
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  disabled={isSavingPassword}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">新密码</span>
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  disabled={isSavingPassword}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">确认新密码</span>
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  disabled={isSavingPassword}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSavingPassword}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                  onClick={() => {
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setIsEditingPassword(false);
                    setPanelMessage("");
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingPassword ? "修改中" : "确认修改"}
                </button>
              </div>
            </form>
          ) : null}
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
  disabled = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
      ].join(" ")}
      disabled={disabled}
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
