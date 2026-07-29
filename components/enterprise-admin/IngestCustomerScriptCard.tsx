"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { copyAdminIngestText } from "@/lib/enterprise/admin-ingest-clipboard";

type CopyState = "idle" | "copied" | "failed";

export function IngestCustomerScriptCard({ content }: { content: string }) {
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
  }, []);

  async function handleCopy() {
    const copied = await copyAdminIngestText(content);

    setCopyState(copied ? "copied" : "failed");

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = setTimeout(() => {
      setCopyState("idle");
      resetTimerRef.current = null;
    }, 1600);
  }

  return (
    <section
      data-admin-ingest-customer-script-card="true"
      className="rounded-2xl border border-[#e3e6ea] bg-[#f7f8fa] p-4 text-[#344054] shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#52606d]">可直接发给客户</p>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copyState === "copied" ? "话术已复制" : "复制客户话术"}
          className={[
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 text-xs font-semibold transition active:scale-[0.98]",
            copyState === "failed"
              ? "border-[#efc3bd] text-[#9b4339]"
              : "border-[#a8dec7] text-[#0f7550] hover:bg-[#e7f8ef]"
          ].join(" ")}
        >
          {copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copyState === "copied"
            ? "已复制"
            : copyState === "failed"
              ? "复制失败"
              : "复制话术"}
        </button>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[#344054]">
        {content}
      </p>
    </section>
  );
}
