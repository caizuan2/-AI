"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import type { GptCallProof } from "@/lib/enterprise/gpt-call-proof";

function shortResponseId(responseId: string) {
  return responseId.length <= 8 ? responseId : responseId.slice(-8);
}

function formatToken(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "未返回";
}

export function IngestGPTCallProofBadge({ proof }: { proof?: GptCallProof }) {
  const [open, setOpen] = useState(false);

  if (!proof) {
    return null;
  }

  const providerLabel = proof.provider === "deepseek" ? "DeepSeek" : "OpenAI";
  const modelLabel = proof.provider === "deepseek" ? "DeepSeek-V4-Pro" : "GPT-5.5";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#eefbf4] px-2.5 py-1 text-[11px] font-semibold text-[#147a43] transition hover:bg-[#e2f6eb]"
        aria-expanded={open}
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {modelLabel} · {providerLabel} · fallback:false · {shortResponseId(proof.responseId)}
        <ChevronDown className={["h-3 w-3 transition", open ? "rotate-180" : ""].join(" ")} aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-[320px] rounded-2xl border border-[#dededb] bg-white p-3 text-[11px] leading-5 text-[#555] shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#eeeeeb] pb-2">
            <span className="font-semibold text-[#202020]">模型调用证据</span>
            <span className="rounded-full bg-[#f4f4f2] px-2 py-0.5 font-semibold text-[#666]">{proof.actualModel}</span>
          </div>
          <div className="grid gap-1">
            <p>provider：{proof.provider}</p>
            <p>endpoint：{proof.endpoint}</p>
            <p>requestedModel：{proof.requestedModel}</p>
            <p>actualModel：{proof.actualModel}</p>
            <p>responseId：{proof.responseId}</p>
            {proof.proofId ? <p>proofId：{proof.proofId}</p> : null}
            {proof.proofIdSource ? <p>proofIdSource：{proof.proofIdSource}</p> : null}
            <p>fallback：{String(proof.fallback)}</p>
            <p>qualityPassed：{String(proof.qualityPassed)}</p>
            <p>deepenAttempts：{proof.deepenAttempts}</p>
            <p>outputTokens：{formatToken(proof.usage?.outputTokens)}</p>
            <p>reasoningTokens：{formatToken(proof.usage?.reasoningTokens)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
