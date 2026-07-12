import {
  BellRing,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListTodo,
  LoaderCircle,
  ShieldAlert,
  UsersRound
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  NotificationPagination,
  NotificationRecord,
  NotificationType
} from "@/apps/team-os/features/notification/types";

const TYPE_META: Record<NotificationType, {
  label: string;
  icon: typeof BellRing;
  iconClassName: string;
}> = {
  TASK: { label: "任务提醒", icon: ListTodo, iconClassName: "bg-blue-50 text-blue-700" },
  AI_COACH: { label: "AI 报告", icon: Bot, iconClassName: "bg-violet-50 text-violet-700" },
  CRM: { label: "客户提醒", icon: UsersRound, iconClassName: "bg-amber-50 text-amber-700" },
  TRAINING: { label: "培训提醒", icon: GraduationCap, iconClassName: "bg-emerald-50 text-emerald-700" },
  SYSTEM: { label: "系统消息", icon: ShieldAlert, iconClassName: "bg-slate-100 text-slate-700" }
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function NotificationList({
  items,
  pagination,
  readOnly,
  readingId,
  disabled = false,
  onMarkRead,
  onPageChange
}: {
  items: NotificationRecord[];
  pagination: NotificationPagination;
  readOnly: boolean;
  readingId: string | null;
  disabled?: boolean;
  onMarkRead: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((item) => {
          const meta = TYPE_META[item.type];
          const Icon = meta.icon;
          const unread = item.readStatus === "UNREAD";
          const marking = readingId === item.id;

          return (
            <Card
              key={item.id}
              className={unread ? "border-indigo-200 bg-indigo-50/20 shadow-sm" : "border-slate-200 shadow-none"}
            >
              <CardContent className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.iconClassName}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{meta.label}</Badge>
                    {unread ? <Badge>未读</Badge> : <Badge variant="secondary">已读</Badge>}
                    {readOnly ? (
                      <Badge variant="secondary">接收成员：{item.recipientName?.trim() || "未命名成员"}</Badge>
                    ) : null}
                    <span className="text-xs text-slate-400">{formatNotificationTime(item.createdAt)}</span>
                  </div>
                  <h2 className="mt-3 break-words text-base font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.content}</p>
                  <p className="mt-3 break-all text-xs text-slate-400">来源：{item.source}</p>
                </div>
                {!readOnly && unread ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || Boolean(readingId)}
                    onClick={() => onMarkRead(item.id)}
                    aria-label={`将“${item.title}”标记为已读`}
                  >
                    {marking ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    {marking ? "处理中…" : "标记已读"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {pagination.totalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-xs text-slate-500 sm:text-left">
            第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
          </p>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
