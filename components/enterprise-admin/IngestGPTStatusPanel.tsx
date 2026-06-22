"use client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wifi } from "lucide-react";
import type { IngestGptHealthStatus } from "@/lib/enterprise/ingest-client";

export function IngestGPTStatusPanel({
  selectedModel,
  status,
  isChecking,
  onCheck,
  onReconnect
}: {
  selectedModel: string;
  status: IngestGptHealthStatus | null;
  isChecking: boolean;
  onCheck: () => void;
  onReconnect: () => void;
}) {
  const isOk = status?.ok === true;
  const statusText = status
    ? isOk
      ? "已连接"
      : status.apiKeyConfigured
        ? "请求失败"
        : "未配置"
    : "未检查";
  const apiKeyText = status
    ? status.apiKeyConfigured ? "已配置" : "未配置"
    : "未检查";
  const baseUrlText = status
    ? status.baseUrlSource === "configured" ? "已配置" : "默认 OpenAI"
    : "未检查";
  const icon = isChecking
    ? <Loader2 className="h-4 w-4 animate-spin text-[#128246]" aria-hidden="true" />
    : isOk
      ? <CheckCircle2 className="h-4 w-4 text-[#128246]" aria-hidden="true" />
      : status
        ? <AlertTriangle className="h-4 w-4 text-[#b93b4a]" aria-hidden="true" />
        : <Wifi className="h-4 w-4 text-[#777]" aria-hidden="true" />;

  return (
    <section className="mt-4 rounded-[24px] border border-[#eeeeeb] bg-[#fbfbfa] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#202020]">
            {icon}
            GPT 接口状态
          </div>
          <p className="mt-1 text-xs leading-5 text-[#888]">
            服务端读取 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL，前端不接触密钥。
          </p>
        </div>
        <span className={[
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
          isOk ? "bg-[#e9f8ef] text-[#128246]" : status ? "bg-[#fff3f4] text-[#b93b4a]" : "bg-white text-[#777]"
        ].join(" ")}>
          {statusText}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <Info label="当前模型" value={status?.selectedModelLabel || selectedModel} />
        <Info label="当前 Provider" value="OpenAI GPT" />
        <Info label="API Key" value={apiKeyText} />
        <Info label="Base URL" value={baseUrlText} />
        <Info label="状态" value={status?.message || "尚未检查 GPT 接口状态"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCheck}
          disabled={isChecking}
          className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-[#202020] shadow-sm transition hover:bg-[#f6f6f5] disabled:text-[#aaa]"
        >
          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wifi className="h-4 w-4" aria-hidden="true" />}
          检查 GPT 状态
        </button>
        <button
          type="button"
          onClick={onReconnect}
          disabled={isChecking}
          className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#202020] px-3 text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
        >
          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          重新连接 GPT
        </button>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
      <span className="shrink-0 font-semibold text-[#888]">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-[#202020]">{value}</span>
    </div>
  );
}
