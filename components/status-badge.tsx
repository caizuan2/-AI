import type { FeedStatus, KnowledgeStatus } from "@/types";
import { cn } from "@/lib/utils";

const labels: Record<KnowledgeStatus | FeedStatus, string> = {
  active: "有效",
  synced: "已同步",
  draft: "草稿",
  processing: "处理中",
  stale: "已过期",
  archived: "已归档",
  queued: "排队中",
  completed: "已完成",
  failed: "失败"
};

const styles: Record<KnowledgeStatus | FeedStatus, string> = {
  active: "bg-teal-50 text-teal-700 ring-teal-100",
  synced: "bg-teal-50 text-teal-700 ring-teal-100",
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  processing: "bg-amber-50 text-amber-700 ring-amber-100",
  stale: "bg-rose-50 text-rose-700 ring-rose-100",
  archived: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  queued: "bg-violet-50 text-violet-700 ring-violet-100",
  completed: "bg-teal-50 text-teal-700 ring-teal-100",
  failed: "bg-rose-50 text-rose-700 ring-rose-100"
};

export function StatusBadge({ status }: { status: KnowledgeStatus | FeedStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}
