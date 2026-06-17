"use client";

import { useRef, useState, type ChangeEvent, type ComponentType } from "react";
import {
  ChevronDown,
  FileText,
  FileType2,
  ImagePlus,
  Link2,
  ListChecks,
  Loader2,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Presentation,
  Save,
  Scissors,
  SendHorizontal,
  Sparkles,
  Tags,
  UploadCloud
} from "lucide-react";

const moreToolActions: Array<{ label: string; icon: ComponentType<{ className?: string }> }> = [
  { label: "图片 OCR", icon: ImagePlus },
  { label: "PDF", icon: FileType2 },
  { label: "Word", icon: FileText },
  { label: "PPT", icon: Presentation },
  { label: "网址", icon: Link2 },
  { label: "分类标签", icon: Tags },
  { label: "AI 修正", icon: Scissors },
  { label: "保存知识", icon: Save },
  { label: "训练记录", icon: ListChecks }
];

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
  };
}

interface IngestApiData {
  stage: "parsed" | "saved";
  job: {
    id: string;
  };
  draft: {
    title: string;
    category: string;
    fallbackUsed: boolean;
  };
  vectorStatus?: {
    indexed: boolean;
    model: string | null;
    provider: string | null;
    fallbackUsed: boolean;
    dimensions: number;
    indexedAt: string | null;
  };
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "请求失败，请稍后重试。");
  }

  return payload.data;
}

export function IngestEXEInputBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("真实 AI 投喂链路已接入：发送后生成结构化知识，确认后入库。");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  async function handleSend() {
    const value = input.trim();

    if (!value) {
      setStatusText("请输入投喂任务后再发送。");
      return;
    }

    setIsParsing(true);
    setStatusText("AI 正在解析并生成结构化知识...");

    try {
      const response = await fetch("/api/core/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: value,
          source: "admin_ingest",
          agentId: "workbench",
          agentName: "EXE工作台"
        })
      });
      const data = await readApiData<IngestApiData>(response);

      setJobId(data.stage === "saved" ? null : data.job.id);
      setInput("");
      const vectorText = data.vectorStatus?.indexed
        ? ` · 语义索引完成${data.vectorStatus.fallbackUsed ? " · mock向量" : ""}`
        : "";
      setStatusText(
        data.stage === "saved"
          ? `已写入统一知识库：${data.draft.title} · ${data.draft.category}${data.draft.fallbackUsed ? " · fallback" : ""}${vectorText}`
          : `已生成：${data.draft.title} · ${data.draft.category}${data.draft.fallbackUsed ? " · fallback" : ""}`
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "AI投喂失败，请稍后重试。");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave() {
    if (!jobId) {
      setStatusText("请先发送AI投喂，生成可保存的训练记录。");
      return;
    }

    setIsSaving(true);
    setStatusText("正在保存知识并更新训练记录...");

    try {
      await readApiData(await fetch("/api/admin/kb/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ jobId })
      }));
      setStatusText("已保存到知识库，训练记录已更新。");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "保存知识失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      setStatusText(`已选择文件：${file.name}，后续可进入文档解析流程。`);
    }

    event.target.value = "";
  }

  function handleMoreTool(label: string) {
    setIsMoreOpen(false);

    if (label === "保存知识") {
      void handleSave();
      return;
    }

    setStatusText(`${label}入口已打开，当前阶段保留为投喂工作台快捷入口。`);
  }

  return (
    <div className="shrink-0 border-t border-[#ececea] bg-white px-6 py-4">
      <div className="rounded-[24px] border border-[#e6e6e3] bg-white p-3 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          rows={3}
          placeholder="可以描述任务或提问任何问题"
          className="min-h-[84px] w-full resize-none rounded-2xl border-0 bg-[#fbfbfa] px-4 py-3 text-sm leading-6 text-[#202020] outline-none placeholder:text-[#a0a0a0] focus:bg-white"
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"
          onChange={handleFileChange}
        />
        <div className="mt-2 flex flex-col gap-2 border-t border-[#f0f0ee] pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-[#555]">
            <button type="button" onClick={() => setStatusText("当前模型：DeepSeek-V4-Pro。")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
              <Sparkles className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
              DeepSeek-V4-Pro
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setStatusText("连接入口已保留，可接入企业知识源或外部系统。")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
              <Plug className="h-3.5 w-3.5" aria-hidden="true" />
              连接
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={handleUploadClick} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 transition hover:bg-[#ededeb]">
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              上传
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreOpen((current) => !current)}
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
                        disabled={action.label === "保存知识" && isSaving}
                        className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-[#444] transition hover:bg-[#f5f5f3] disabled:cursor-not-allowed disabled:text-[#aaa]"
                      >
                        {action.label === "保存知识" && isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#777]" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5 text-[#777]" aria-hidden="true" />}
                        {action.label === "保存知识" && isSaving ? "保存中" : action.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <button type="button" title="AI 修正" onClick={() => setStatusText("AI 修正入口已保留，也可从更多菜单进入。")} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Scissors className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" title="附件" onClick={handleUploadClick} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" title="语音备注" onClick={() => setStatusText("语音备注入口已保留，后续可接入语音投喂。")} className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={handleSend} disabled={isParsing || !input.trim()} className="flex h-10 items-center gap-2 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#e6e6e3] disabled:text-[#aaa]">
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              {isParsing ? "发送中" : "发送AI投喂"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[#aaa]">{statusText}</p>
    </div>
  );
}
