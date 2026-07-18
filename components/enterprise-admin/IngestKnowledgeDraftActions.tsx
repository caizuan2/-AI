"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, FileText, Loader2, Pencil, Plug, RefreshCw, Save } from "lucide-react";

type SaveState = "idle" | "saving" | "saved" | "error";

function getInitialSaveState(isSaved: boolean, isError: boolean, isSaving: boolean): SaveState {
  if (isSaving) return "saving";
  if (isSaved) return "saved";
  if (isError) return "error";
  return "idle";
}

function normalizeSaveError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = rawMessage.trim();
  const lowerMessage = message.toLowerCase();

  if (!message) {
    return "保存失败，请稍后重试。";
  }

  if (message.includes("请先登录") || message.includes("未登录") || lowerMessage.includes("unauthorized") || message.includes("401")) {
    return "登录状态已失效，请重新登录后再保存。";
  }

  if (message.includes("无权限") || lowerMessage.includes("forbidden") || message.includes("403")) {
    return "当前账号没有保存知识库权限。";
  }

  if (message.includes("500") || lowerMessage.includes("internal server error")) {
    return "保存接口异常，请稍后重试或查看服务日志。";
  }

  return message;
}

export function IngestKnowledgeDraftActions({
  isSaving,
  isSaved,
  isError = false,
  isParsing,
  hasDraft = true,
  jobId = null,
  draftId = null,
  sourceMaterials = [],
  onCopy,
  onSave,
  onRegenerate,
  onContinueOptimize,
  onSourceOpen,
  onReconnectGpt,
  feedbackActions
}: {
  isSaving: boolean;
  isSaved: boolean;
  isError?: boolean;
  isParsing: boolean;
  hasDraft?: boolean;
  jobId?: string | null;
  draftId?: string | null;
  sourceMaterials?: string[];
  onCopy: () => void;
  onOpenDraft: () => void;
  onSave?: () => Promise<unknown> | unknown;
  onRegenerate: () => void;
  onContinueOptimize: () => void;
  onSourceOpen?: () => void;
  onReconnectGpt?: () => void;
  feedbackActions?: ReactNode;
}) {
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(() => getInitialSaveState(isSaved, isError, isSaving));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<string | null>(null);
  const hasOnSave = typeof onSave === "function";
  const saveAllowed = hasDraft || Boolean(draftId);

  useEffect(() => {
    setSaveState(getInitialSaveState(isSaved, isError, isSaving));
    setSaveError(null);
    setLastSaveResult(null);
  }, [draftId, jobId, isError, isSaved, isSaving]);

  useEffect(() => {
    if (isSaving) {
      setSaveState("saving");
      setLastSaveResult("正在保存知识库...");
      return;
    }

    if (isSaved) {
      setSaveState("saved");
      setSaveError(null);
      setLastSaveResult("已保存到知识库，可在训练记忆中发布到运行时索引。");
      return;
    }

    if (isError) {
      setSaveState("error");
      setLastSaveResult(null);
      setSaveError((current) => current ?? "保存失败，请点击重试。");
    }
  }, [isError, isSaved, isSaving]);

  const normalizedSources = useMemo(
    () => Array.from(new Set(sourceMaterials.map((source) => source.trim()).filter(Boolean))),
    [sourceMaterials]
  );
  const actionButtonClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/80 text-[#6f6f6a] shadow-sm transition hover:border-neutral-300 hover:bg-[#f5f5f3] hover:text-[#202020] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#202020]/15";
  const iconClass = "h-4 w-4 stroke-[2]";
  const saveTitle = saveState === "saving" ? "保存中" : saveState === "saved" ? "已入库" : saveState === "error" ? "保存失败，点击重试" : "保存知识库";
  const saveButtonClass = [
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white/80 shadow-sm transition focus:outline-none focus-visible:ring-2 disabled:text-[#aaa]",
    saveState === "error"
      ? "border-rose-200 text-[#b93b4a] hover:bg-[#ffe5e9] focus-visible:ring-[#b93b4a]/20"
      : saveState === "saved"
        ? "border-emerald-200 text-[#128246] hover:bg-[#ecf8f0] focus-visible:ring-[#128246]/20"
        : "border-neutral-200 text-[#238a4f] hover:border-emerald-200 hover:bg-[#ecf8f0] focus-visible:ring-[#128246]/20"
  ].join(" ");
  const saveStatusMessage = saveError ?? lastSaveResult;

  async function handleSaveClick() {
    if (saveState === "saving" || isSaving) {
      return;
    }

    if (saveState === "saved") {
      setLastSaveResult("已保存到知识库，可在训练记忆中发布到运行时索引。");
      setSaveError(null);
      return;
    }

    if (!hasOnSave) {
      setSaveState("error");
      setLastSaveResult(null);
      setSaveError("保存功能未绑定，请刷新页面后重试。");
      return;
    }

    if (!saveAllowed) {
      setSaveState("error");
      setLastSaveResult(null);
      setSaveError("没有可保存的知识内容。");
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    setLastSaveResult("正在保存知识库...");

    try {
      const result = await onSave();

      if (result === null) {
        throw new Error("保存未完成，请查看页面提示或重新登录后再试。");
      }

      setSaveState("saved");
      setSaveError(null);
      setLastSaveResult("已保存到知识库，可在训练记忆中发布到运行时索引。");
    } catch (error) {
      setSaveState("error");
      setLastSaveResult(null);
      setSaveError(normalizeSaveError(error));
    }
  }

  return (
    <div className="mt-3 flex w-full items-center gap-1.5 whitespace-nowrap pb-1">
      <button type="button" onClick={onCopy} title="复制" aria-label="复制" className={actionButtonClass}>
        <Copy className={iconClass} aria-hidden="true" />
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsSourceOpen((current) => {
              const nextOpen = !current;

              if (nextOpen) {
                onSourceOpen?.();
              }

              return nextOpen;
            });
          }}
          title="来源"
          aria-label="来源"
          aria-expanded={isSourceOpen}
          className={actionButtonClass}
        >
          <FileText className={iconClass} aria-hidden="true" />
        </button>
        {isSourceOpen ? (
          <div className="absolute bottom-12 left-0 z-30 w-72 rounded-2xl border border-[#e7e7e4] bg-white p-3 text-left text-xs text-[#555] shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
            <p className="font-semibold text-[#202020]">来源资料</p>
            {normalizedSources.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {normalizedSources.map((source) => (
                  <li key={source} className="flex gap-2 leading-5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c7c7c1]" aria-hidden="true" />
                    <span className="min-w-0 break-words">{source}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 leading-5 text-[#777]">暂无明确来源</p>
            )}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void handleSaveClick()}
        disabled={saveState === "saving"}
        title={saveTitle}
        aria-label={saveTitle}
        className={saveButtonClass}
      >
        {saveState === "saving" ? <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" /> : saveState === "saved" ? <Check className={iconClass} aria-hidden="true" /> : saveState === "error" ? <AlertTriangle className={iconClass} aria-hidden="true" /> : <Save className={iconClass} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onRegenerate} disabled={isParsing} title={isParsing ? "生成中" : "重新生成"} aria-label={isParsing ? "生成中" : "重新生成"} className={`${actionButtonClass} disabled:text-[#aaa]`}>
        <RefreshCw className={isParsing ? `${iconClass} animate-spin` : iconClass} aria-hidden="true" />
      </button>
      <button type="button" onClick={onContinueOptimize} title="继续优化" aria-label="继续优化" className={actionButtonClass}>
        <Pencil className={iconClass} aria-hidden="true" />
      </button>
      {onReconnectGpt ? (
        <button type="button" onClick={onReconnectGpt} title="重新连接 GPT" aria-label="重新连接 GPT" className={actionButtonClass}>
          <Plug className={iconClass} aria-hidden="true" />
        </button>
      ) : null}
      {feedbackActions}
      {saveStatusMessage ? (
        <span className={saveState === "error" ? "ml-1 text-xs font-medium text-[#b93b4a]" : "ml-1 text-xs font-medium text-[#5f6f67]"} role={saveState === "error" ? "alert" : "status"}>
          {saveStatusMessage}
        </span>
      ) : null}
    </div>
  );
}
