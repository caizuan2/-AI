"use client";

import { AiBrainErrorState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";

export default function AiBrainRouteError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <AiBrainErrorState message="企业 AI 大脑页面加载失败，请重试。" onRetry={reset} />
    </div>
  );
}
