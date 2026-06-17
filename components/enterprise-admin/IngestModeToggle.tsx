"use client";

import { useState } from "react";
import { MessageSquareText, MonitorCog } from "lucide-react";
import { IngestChatGPTShell } from "@/components/enterprise-admin/IngestChatGPTShell";
import { IngestEXEShell } from "@/components/enterprise-admin/IngestEXEShell";

type IngestMode = "chat" | "workbench";

export function IngestModeToggle() {
  const [mode, setMode] = useState<IngestMode>("chat");

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919]">
      <div className="absolute left-[392px] top-5 z-50 flex rounded-full border border-[#ededeb] bg-[#f2f2f1]/95 p-1 text-sm font-semibold shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur max-md:left-1/2 max-md:-translate-x-1/2">
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={[
            "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
            mode === "chat" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
          ].join(" ")}
        >
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          对话
        </button>
        <button
          type="button"
          onClick={() => setMode("workbench")}
          className={[
            "flex h-7 items-center gap-1.5 rounded-full px-5 transition",
            mode === "workbench" ? "bg-white text-[#202020] shadow-sm" : "text-[#666] hover:text-[#202020]"
          ].join(" ")}
        >
          <MonitorCog className="h-4 w-4" aria-hidden="true" />
          工作室
        </button>
      </div>

      {mode === "chat" ? <IngestChatGPTShell /> : <IngestEXEShell />}
    </div>
  );
}
