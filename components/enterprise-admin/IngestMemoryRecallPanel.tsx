"use client";

import { Copy, RefreshCcw } from "lucide-react";
import type { IngestMemoryRecallCandidate } from "@/lib/enterprise/ingest-memory-types";

export function IngestMemoryRecallPanel({
  memories,
  memoryContextText,
  agentLearningInstruction,
  finalPromptPreview,
  isLoading,
  onRefresh,
  onCopy
}: {
  memories: IngestMemoryRecallCandidate[];
  memoryContextText?: string;
  agentLearningInstruction?: string;
  finalPromptPreview?: string;
  isLoading?: boolean;
  onRefresh: () => void;
  onCopy: (text: string) => void;
}) {
  const copyText = finalPromptPreview || [agentLearningInstruction, memoryContextText].filter(Boolean).join("\n\n");

  return (
    <section className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#27231d]">本轮召回记忆</h2>
          <p className="mt-1 text-xs text-[#8a8378]">只作为本轮参考，不自动入库、不污染 RAG。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-[#e1dbcf] bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#4b463f] transition hover:bg-[#f5f0e7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {isLoading ? "召回中" : "刷新召回"}
          </button>
          <button
            type="button"
            onClick={() => onCopy(copyText)}
            disabled={!copyText}
            className="inline-flex items-center gap-2 rounded-full border border-[#e1dbcf] bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#4b463f] transition hover:bg-[#f5f0e7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            复制记忆上下文
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {memories.length ? memories.map((item) => (
          <div key={item.memory.id} className="rounded-2xl border border-[#eee8dd] bg-[#fbfaf7] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#27231d]">{item.memory.title}</p>
                <p className="mt-1 text-xs text-[#8a8378]">{item.memory.type} · {item.reason}</p>
              </div>
              <span className="rounded-full bg-[#1f1f1f] px-2.5 py-1 text-xs font-semibold text-white">
                {Math.round(item.score * 100)}
              </span>
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#5f584e]">{item.memory.summary || item.memory.content}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.matchedFields.map((field) => (
                <span key={field} className="rounded-full bg-white px-2 py-1 text-[11px] text-[#8a8378]">
                  {field}
                </span>
              ))}
              {item.injected ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  已注入
                </span>
              ) : null}
            </div>
          </div>
        )) : (
          <div className="rounded-2xl bg-[#fbfaf7] px-4 py-8 text-center text-sm text-[#8a8378]">
            暂无召回记忆。发送几轮对话并提取训练记忆后，这里会显示可参考内容。
          </div>
        )}
      </div>
      {finalPromptPreview ? (
        <details className="mt-4 rounded-2xl border border-[#eee8dd] bg-[#fbfaf7] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#27231d]">
            预览本轮 Prompt
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-5 text-[#5f584e]">
            {finalPromptPreview}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
