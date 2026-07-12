"use client";

import { NotificationErrorState } from "@/apps/team-os/features/notification/components/NotificationState";

export default function NotificationRoutesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <NotificationErrorState
        message="企业消息与连接页面加载失败，请重试。"
        onRetry={reset}
      />
    </div>
  );
}
