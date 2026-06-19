"use client";

import { ImagePlus, KeyRound, LogOut, Settings, X } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import type {
  IngestConnectionStatus,
  IngestPlatform,
  IngestUploadState,
  IngestVoiceState
} from "@/lib/enterprise/ingest-client";
import { getAdminIngestPlatformLabel } from "@/lib/enterprise/admin-ingest-platform";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export interface IngestSettingsState {
  autoSaveStructuredResult: boolean;
  uploadPreference: "composer" | "queue";
  localPreviewMode: boolean;
  platform: IngestPlatform;
  syncTarget: Array<"web" | "exe" | "apk">;
}

export function IngestSettingsPanel({
  open,
  activeAgent,
  selectedModel,
  connectionStatus,
  uploadedFiles,
  voiceState,
  settingsState,
  adminAvatar,
  onSettingsChange,
  onAvatarChange,
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
  onSettingsChange: (nextState: IngestSettingsState) => void;
  onAvatarChange: (nextAvatar: string) => void;
  onAccountAction: (action: "password" | "switch") => void;
  onClose: () => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null);

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
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <div className="absolute inset-0 z-[70] flex justify-end bg-black/10 p-4">
      <aside className="h-full w-full max-w-[390px] overflow-y-auto rounded-[28px] border border-[#e7e7e4] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#202020]">
              <Settings className="h-4 w-4 text-[#128246]" aria-hidden="true" />
              当前投喂端设置
            </div>
            <p className="mt-1 text-xs text-[#888]">仅作用于 /admin-ingest 当前工作台，不修改系统设置核心逻辑。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f3] text-[#555] hover:bg-[#ededeb]" aria-label="关闭设置面板">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-[24px] border border-[#eeeeeb] bg-[#fbfbfa] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-[#d9f8e9] to-[#fff4de] text-sm font-semibold text-[#128246] shadow-sm">
                {adminAvatar ? (
                  <span aria-label="当前头像" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${adminAvatar})` }} />
                ) : (
                  "AI"
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#202020]">账号设置</p>
                <p className="mt-1 text-xs leading-5 text-[#888]">头像仅保存在当前投喂端本地预览，不改登录核心。</p>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </div>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-left text-sm font-semibold text-[#202020] shadow-sm transition hover:bg-[#f6f6f5]"
            >
              <ImagePlus className="h-4 w-4 text-[#128246]" aria-hidden="true" />
              修改头像
            </button>
            <button
              type="button"
              onClick={() => onAccountAction("password")}
              className="flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-left text-sm font-semibold text-[#202020] shadow-sm transition hover:bg-[#f6f6f5]"
            >
              <KeyRound className="h-4 w-4 text-[#777]" aria-hidden="true" />
              修改密码
            </button>
            <button
              type="button"
              onClick={() => onAccountAction("switch")}
              className="flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-left text-sm font-semibold text-[#202020] shadow-sm transition hover:bg-[#f6f6f5]"
            >
              <LogOut className="h-4 w-4 text-[#777]" aria-hidden="true" />
              切换账号
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <InfoRow label="当前 Agent" value={`${activeAgent.name} · ${activeAgent.role}`} />
          <InfoRow label="当前模型" value={selectedModel} />
          <InfoRow label="当前端" value={getAdminIngestPlatformLabel(settingsState.platform)} />
          <InfoRow label="企业空间" value={connectionStatus.enterpriseSpace} />
          <InfoRow label="卡密 / License" value={connectionStatus.licenseStatus} />
          <InfoRow label="同步目标" value={settingsState.syncTarget.join(" / ")} />
          <InfoRow label="上传偏好" value={settingsState.uploadPreference === "composer" ? "附件进入输入框" : "仅加入队列"} />
          <InfoRow label="当前附件" value={uploadedFiles.length ? `${uploadedFiles.length} 个待发送` : "暂无"} />
          <InfoRow label="语音输入" value={voiceState.isRecording ? "正在听写..." : voiceState.isVoiceSupported ? "浏览器支持" : "浏览器暂不支持"} />
          <InfoRow label="功能入口" value="本地配置预览，后续由超级管理员开启" />
          <InfoRow label="本地预览模式" value={settingsState.localPreviewMode ? "开启" : "关闭"} />
        </div>

        <div className="mt-5 space-y-3 rounded-[22px] border border-[#eeeeeb] bg-[#fbfbfa] p-3 text-sm">
          <SettingToggle
            title="自动保存结构化结果"
            description="第一阶段只保存前端偏好，不写数据库。"
            checked={settingsState.autoSaveStructuredResult}
            onChange={(checked) => onSettingsChange({
              ...settingsState,
              autoSaveStructuredResult: checked
            })}
          />
          <SettingToggle
            title="上传后进入输入框"
            description="关闭后仍保留队列字段，下一阶段接后端解析。"
            checked={settingsState.uploadPreference === "composer"}
            onChange={(checked) => onSettingsChange({
              ...settingsState,
              uploadPreference: checked ? "composer" : "queue"
            })}
          />
        </div>
      </aside>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 text-left shadow-sm transition hover:bg-[#f6f6f5]"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#202020]">{title}</span>
        <span className="mt-0.5 block text-xs text-[#888]">{description}</span>
      </span>
      <span className={["relative h-6 w-11 shrink-0 rounded-full p-0.5 transition", checked ? "bg-[#128246]" : "bg-[#d9d9d6]"].join(" ")}>
        <span className={["block h-5 w-5 rounded-full bg-white shadow-sm transition", checked ? "translate-x-5" : "translate-x-0"].join(" ")} />
      </span>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f8f7] px-3 py-2">
      <span className="text-xs font-semibold text-[#888]">{label}</span>
      <span className="min-w-0 truncate text-right text-xs font-semibold text-[#202020]">{value}</span>
    </div>
  );
}
