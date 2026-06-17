"use client";

import { Settings, X } from "lucide-react";
import type {
  IngestConnectionStatus,
  IngestUploadState,
  IngestVoiceState
} from "@/lib/enterprise/ingest-client";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export interface IngestSettingsState {
  autoSaveStructuredResult: boolean;
  uploadPreference: "composer" | "queue";
  localPreviewMode: boolean;
  platform: "web";
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
  onSettingsChange,
  onClose
}: {
  open: boolean;
  activeAgent: IngestChatAgent;
  selectedModel: string;
  connectionStatus: IngestConnectionStatus;
  uploadedFiles: IngestUploadState[];
  voiceState: IngestVoiceState;
  settingsState: IngestSettingsState;
  onSettingsChange: (nextState: IngestSettingsState) => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
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

        <div className="mt-4 space-y-3 text-sm">
          <InfoRow label="当前 Agent" value={`${activeAgent.name} · ${activeAgent.role}`} />
          <InfoRow label="当前模型" value={selectedModel} />
          <InfoRow label="企业空间" value={connectionStatus.enterpriseSpace} />
          <InfoRow label="卡密 / License" value={connectionStatus.licenseStatus} />
          <InfoRow label="同步目标" value={settingsState.syncTarget.join(" / ")} />
          <InfoRow label="上传偏好" value={settingsState.uploadPreference === "composer" ? "附件进入输入框" : "仅加入队列"} />
          <InfoRow label="当前附件" value={uploadedFiles.length ? `${uploadedFiles.length} 个待发送` : "暂无"} />
          <InfoRow label="语音输入" value={voiceState.isRecording ? "正在听写..." : voiceState.isVoiceSupported ? "浏览器支持" : "浏览器暂不支持"} />
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
