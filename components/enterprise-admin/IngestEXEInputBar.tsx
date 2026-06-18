"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ComponentType } from "react";
import {
  ImagePlus,
  Link2,
  Loader2,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Scissors,
  SendHorizontal,
  Tags,
  UploadCloud
} from "lucide-react";
import { IngestAttachmentPreview } from "@/components/enterprise-admin/IngestAttachmentPreview";
import { IngestGPTModelPicker } from "@/components/enterprise-admin/IngestGPTModelPicker";
import { getAdminIngestPlatformLabel } from "@/lib/enterprise/admin-ingest-platform";
import type {
  IngestConnectionStatus,
  IngestVoiceState,
  IngestUploadState
} from "@/lib/enterprise/ingest-client";
import type {
  IngestChatAgent,
  IngestKnowledgeDraft,
  IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";

const moreToolActions: Array<{ label: string; icon: ComponentType<{ className?: string }> }> = [
  { label: "文件上传", icon: UploadCloud },
  { label: "图片 OCR", icon: ImagePlus },
  { label: "网址投喂", icon: Link2 },
  { label: "分类标签", icon: Tags },
  { label: "连接状态", icon: Plug }
];
const organizeActions = ["提取重点", "改写为标准问答", "生成分类标签", "检查是否需要 AI 修正"];

type IngestActionResult = {
  draft: IngestKnowledgeDraft;
  records: IngestTrainingRecord[];
  preview: boolean;
  message: string;
};

interface IngestEXEInputBarProps {
  activeAgent: IngestChatAgent;
  input: string;
  onInputChange: (value: string) => void;
  noticeMessage: string;
  errorMessage: string;
  uploadState: IngestUploadState | null;
  uploadedFiles: IngestUploadState[];
  voiceState: IngestVoiceState;
  selectedModel: string;
  modelOptions: string[];
  onModelChange: (model: string) => void;
  connectionStatus: IngestConnectionStatus;
  onCheckConnection: () => Promise<IngestConnectionStatus>;
  isParsing: boolean;
  onSend: (value?: string) => Promise<IngestActionResult | null>;
  onUpload: (files: File[]) => void;
  onRemoveUpload: (fileId: string) => void;
  onVoiceToggle: () => void;
  onToolAction: (label: string) => void;
}

const uploadAcceptByTool: Record<string, string> = {
  "文件上传": ".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md",
  "图片 OCR": "image/*"
};

export function IngestEXEInputBar({
  activeAgent,
  input,
  onInputChange,
  uploadedFiles,
  voiceState,
  selectedModel,
  onModelChange,
  connectionStatus,
  onCheckConnection,
  isParsing,
  onSend,
  onUpload,
  onRemoveUpload,
  onVoiceToggle,
  onToolAction
}: IngestEXEInputBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
  const selectedModelLabel = selectedModel;

  useEffect(() => {
    if (!isMoreOpen && !isConnectionOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (moreMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsMoreOpen(false);
      setIsConnectionOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
        setIsConnectionOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreOpen, isConnectionOpen]);

  async function handleSend() {
    const value = input.trim();
    await onSend(value);
  }

  function handleUploadClick() {
    setFileAccept(".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      onUpload(files);
    }

    event.target.value = "";
  }

  function openTypedUpload(label: string) {
    setFileAccept(uploadAcceptByTool[label] ?? ".pdf,.doc,.docx,.ppt,.pptx,image/*,.txt,.md");
    onToolAction(label);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function handleMoreTool(label: string) {
    setIsMoreOpen(false);

    if (label === "连接状态") {
      setIsConnectionOpen(true);
      void onCheckConnection();
      return;
    }

    if (label in uploadAcceptByTool) {
      openTypedUpload(label);
      return;
    }

    if (label === "网址投喂") {
      onToolAction(label);
      return;
    }

    if (label === "分类标签") {
      onToolAction(label);
      return;
    }

    onToolAction(label);
  }

  return (
    <div className="shrink-0 border-t border-[#ececea] bg-white px-6 py-4">
      <div className="rounded-[24px] border border-[#e6e6e3] bg-white p-3 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
        {uploadedFiles.length > 0 ? (
          <div className="mb-2 rounded-2xl bg-[#f8f8f7] p-2">
            <IngestAttachmentPreview files={uploadedFiles} onRemove={onRemoveUpload} />
          </div>
        ) : null}
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          rows={3}
          placeholder={`可以向${activeAgent.name}描述任务或提问任何问题`}
          className="min-h-[84px] w-full resize-none rounded-2xl border-0 bg-[#fbfbfa] px-4 py-3 text-sm leading-6 text-[#202020] outline-none placeholder:text-[#a0a0a0] focus:bg-white"
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={fileAccept}
          multiple
          onChange={handleFileChange}
        />
        <div className="mt-2 flex flex-col gap-2 border-t border-[#f0f0ee] pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-[#555]">
            <IngestGPTModelPicker
              selectedModel={selectedModelLabel}
              onModelChange={(selection) => onModelChange(selection.displayName)}
              onOpen={() => {
                setIsMoreOpen(false);
                setIsConnectionOpen(false);
              }}
            />
            <div ref={moreMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen((current) => !current);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]"
                aria-expanded={isMoreOpen}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                更多 +
              </button>
              {isMoreOpen ? (
                <div className="absolute bottom-11 left-0 z-30 w-56 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                  {moreToolActions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => handleMoreTool(action.label)}
                        className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-[#444] transition hover:bg-[#f5f5f3]"
                      >
                        <Icon className="h-3.5 w-3.5 text-[#777]" aria-hidden="true" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {isConnectionOpen ? (
                <div className="absolute bottom-11 left-0 z-30 w-64 rounded-2xl border border-[#e7e7e4] bg-white p-3 text-xs shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                  <p className="font-semibold text-[#202020]">连接状态</p>
                  <div className="mt-2 space-y-1.5 text-[#666]">
                    <p>企业空间：{connectionStatus.enterpriseSpace}</p>
                    <p>知识库：{connectionStatus.knowledgeBase}</p>
                    <p>当前端：{getAdminIngestPlatformLabel(voiceState.platform)}</p>
                    <p>同步目标：Web / EXE / APK</p>
                    <p>同账号同步投喂记录、Agent、知识库和训练记录</p>
                    <p>卡密状态：{connectionStatus.licenseStatus}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <div className="relative">
              <button type="button" title="AI 修正 / 整理工具" aria-label="AI 修正 / 整理工具" onClick={() => setIsOrganizeOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]" aria-expanded={isOrganizeOpen}>
                <Scissors className="h-4 w-4" aria-hidden="true" />
              </button>
              {isOrganizeOpen ? (
                <div className="absolute bottom-11 right-0 z-30 w-56 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                  {organizeActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => {
                        setIsOrganizeOpen(false);
                        onToolAction(action);
                      }}
                      className="flex h-9 w-full items-center rounded-xl px-3 text-left text-xs font-semibold text-[#444] transition hover:bg-[#f5f5f3]"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" title="附件" onClick={handleUploadClick} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={voiceState.isRecording ? "停止语音输入" : "语音备注"}
              onClick={onVoiceToggle}
              className={[
                "flex h-9 w-9 items-center justify-center rounded-full transition",
                voiceState.isRecording ? "bg-[#ffe5e9] text-[#b93b4a]" : voiceState.error ? "text-[#b93b4a] hover:bg-[#fff3f4]" : "text-[#555] hover:bg-[#f3f3f1]"
              ].join(" ")}
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={handleSend} disabled={isParsing || (!input.trim() && uploadedFiles.length === 0)} className="flex h-10 items-center gap-2 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#e6e6e3] disabled:text-[#aaa]">
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              {isParsing ? "发送中" : "发送AI投喂"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
