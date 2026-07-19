import { Badge } from "@/components/ui/badge";
import type {
  TrainingAssignmentStatus,
  TrainingCourseCategory,
  TrainingCourseLevel,
  TrainingCourseStatus,
  TrainingRecordStatus
} from "@/apps/team-os/features/training/types";

export const trainingCategoryLabels: Record<TrainingCourseCategory, string> = {
  PRODUCT: "产品知识",
  SALES: "销售能力",
  CUSTOMER_SERVICE: "客户服务",
  MANAGEMENT: "管理能力",
  OTHER: "其他"
};

export const trainingLevelLabels: Record<TrainingCourseLevel, string> = {
  BEGINNER: "入门",
  INTERMEDIATE: "进阶",
  ADVANCED: "高级"
};

export const trainingRecordStatusLabels: Record<TrainingRecordStatus, string> = {
  STARTED: "学习中",
  COMPLETED: "已完成",
  FAILED: "待重训"
};

export const trainingAssignmentStatusLabels: Record<TrainingAssignmentStatus, string> = {
  ASSIGNED: "待学习",
  IN_PROGRESS: "学习中",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export function CourseBadges({ category, level, status }: {
  category: TrainingCourseCategory;
  level: TrainingCourseLevel;
  status: TrainingCourseStatus;
}) {
  return (
    <span className="flex flex-wrap gap-2">
      <Badge>{trainingCategoryLabels[category]}</Badge>
      <Badge variant="secondary">{trainingLevelLabels[level]}</Badge>
      {status === "DISABLED" ? <Badge variant="warning">已停用</Badge> : null}
    </span>
  );
}

export function TrainingRecordBadge({ status }: { status: TrainingRecordStatus }) {
  return <Badge variant={status === "COMPLETED" ? "default" : status === "FAILED" ? "warning" : "secondary"}>{trainingRecordStatusLabels[status]}</Badge>;
}

export function TrainingAssignmentBadge({ status, overdue }: { status: TrainingAssignmentStatus; overdue?: boolean }) {
  return <Badge variant={overdue ? "warning" : status === "COMPLETED" ? "default" : "secondary"}>{overdue ? "已逾期" : trainingAssignmentStatusLabels[status]}</Badge>;
}

export function formatTrainingDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}
