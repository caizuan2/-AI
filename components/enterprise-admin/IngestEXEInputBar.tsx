"use client";

import { useState } from "react";
import { FileText, FileType2, ImagePlus, Link2, Loader2, Mic, Paperclip, Presentation, Save, SendHorizontal, UploadCloud } from "lucide-react";

const attachActions = [
  { label: "上传", icon: UploadCloud },
  { label: "图片", icon: ImagePlus },
  { label: "PPT", icon: Presentation },
  { label: "Word", icon: FileText },
  { label: "PDF", icon: FileType2 },
  { label: "网址", icon: Link2 }
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
  const [input, setInput] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("真实 AI 投喂链路已接入：发送后生成结构化知识，确认后入库。");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
          placeholder="输入投喂任务，例如：把这段客服对话整理成标准知识点，并生成可保存的问答..."
          className="min-h-[84px] w-full resize-none rounded-2xl border-0 bg-[#fbfbfa] px-4 py-3 text-sm leading-6 text-[#202020] outline-none placeholder:text-[#a0a0a0] focus:bg-white"
        />
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {attachActions.map((action) => {
              const Icon = action.icon;

              return (
                <button key={action.label} type="button" className="flex h-9 items-center gap-2 rounded-2xl border border-[#eeeeeb] bg-[#f8f8f7] px-3 text-xs font-medium text-[#4b4b47] transition hover:bg-white">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {action.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" title="附件" className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" title="语音备注" className="flex h-9 w-9 items-center justify-center rounded-full text-[#555] hover:bg-[#f3f3f1]">
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving || !jobId} className="flex h-10 items-center gap-2 rounded-2xl border border-[#d8d8d5] bg-white px-4 text-sm font-semibold text-[#202020] transition hover:bg-[#f6f6f4] disabled:cursor-not-allowed disabled:text-[#aaa]">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              保存知识
            </button>
            <button type="button" onClick={handleSend} disabled={isParsing} className="flex h-10 items-center gap-2 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#777]">
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              发送AI投喂
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[#aaa]">{statusText}</p>
    </div>
  );
}
