"use client";

import { MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export function NextQuestionCard({
  question,
  className,
}: {
  question?: string | null;
  className?: string;
}) {
  if (!question) {
    return null;
  }

  return (
    <div className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-emerald-800">
        <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
        下一句追问
      </div>
      <p className="leading-6">{question}</p>
    </div>
  );
}
