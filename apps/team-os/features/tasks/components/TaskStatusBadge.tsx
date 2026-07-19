import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/apps/team-os/features/tasks/types";

const statusLabels: Record<TaskStatus, string> = {
  PENDING: "待开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variant = status === "PENDING" ? "warning" : status === "COMPLETED" ? "default" : "secondary";
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}
