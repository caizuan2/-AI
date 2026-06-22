"use client";

import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";

export function IngestGPTMessageRenderer({ content }: { content: string }) {
  const safeContent = sanitizeGptOSUserMessage(content);

  return (
    <article className="w-full max-w-[860px] whitespace-pre-wrap break-words text-[15px] leading-[1.78] text-[#2f2f2f]">
      {safeContent}
    </article>
  );
}
