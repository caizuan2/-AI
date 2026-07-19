"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, LoaderCircle, UserRound, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationCompanySelector } from "@/apps/team-os/features/notification/components/NotificationCompanySelector";
import { NotificationList } from "@/apps/team-os/features/notification/components/NotificationList";
import { NotificationPageHeader } from "@/apps/team-os/features/notification/components/NotificationPageHeader";
import { NotificationSectionNavigation } from "@/apps/team-os/features/notification/components/NotificationSectionNavigation";
import {
  NotificationEmptyState,
  NotificationErrorState,
  NotificationForbiddenState,
  NotificationLoadingState
} from "@/apps/team-os/features/notification/components/NotificationState";
import { useNotificationCenter } from "@/apps/team-os/features/notification/hooks/useNotificationData";
import type { NotificationReadStatus, NotificationType } from "@/apps/team-os/features/notification/types";

const TYPE_FILTERS: Array<{ value?: NotificationType; label: string }> = [
  { label: "全部分类" },
  { value: "TASK", label: "任务提醒" },
  { value: "AI_COACH", label: "AI 报告" },
  { value: "CRM", label: "客户提醒" },
  { value: "TRAINING", label: "培训提醒" },
  { value: "SYSTEM", label: "系统消息" }
];

const STATUS_FILTERS: Array<{ value?: NotificationReadStatus; label: string }> = [
  { label: "全部状态" },
  { value: "UNREAD", label: "未读" },
  { value: "READ", label: "已读" }
];

export function NotificationCenterPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useNotificationCenter(initialCompanyId);
  const data = resource.data;
  const activeCompanyId = data?.companyId ?? resource.companyId;
  const actionPending = Boolean(resource.readingId) || resource.markingAll;
  const companyName = data?.companies.find((company) => company.id === data.companyId)?.name ?? "当前企业";

  const handleCompanyChange = React.useCallback((companyId: string) => {
    resource.selectCompany(companyId);
    router.replace(`/team-os/notifications?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <NotificationPageHeader
        eyebrow="Enterprise Message Center"
        title="消息中心"
        description="集中接收任务、AI 教练、客户、培训与系统事件；消息始终按当前账号和企业成员关系隔离。"
        actions={data && resource.scope === "MINE" ? (
          <Button
            variant="outline"
            disabled={data.unreadCount === 0 || actionPending}
            onClick={() => void resource.markAllRead()}
          >
            {resource.markingAll ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
            {resource.markingAll ? "正在处理…" : "全部标记已读"}
          </Button>
        ) : undefined}
      />
      <NotificationSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <NotificationLoadingState label="正在读取通知…" /> : resource.error?.code === "FORBIDDEN" ? (
        <NotificationForbiddenState description="只有当前企业的有效成员可以查看个人通知；团队通知仅对企业负责人和团队主管开放。" />
      ) : resource.error ? (
        <NotificationErrorState message={resource.error.message} onRetry={() => void resource.reload()} />
      ) : data ? (
        <>
          <NotificationCompanySelector
            companyId={data.companyId}
            companyName={companyName}
            companies={data.companies}
            disabled={actionPending}
            onChange={handleCompanyChange}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardContent className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-950">{resource.scope === "MINE" ? "我的通知" : "团队通知"}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {resource.scope === "MINE" ? "个人视图支持更新自己的已读状态。" : "团队视图仅供管理者查看，不会修改成员的已读状态。"}
                  </p>
                </div>
                {resource.scope === "MINE" ? <Badge>{data.unreadCount} 条未读</Badge> : <Badge variant="outline">只读视图</Badge>}
              </CardContent>
            </Card>

            {data.canViewTeamNotifications ? (
              <Card>
                <CardContent className="flex h-full items-center gap-2 p-3">
                  <Button
                    className="min-w-0 flex-1"
                    variant={resource.scope === "MINE" ? "secondary" : "ghost"}
                    size="sm"
                    disabled={actionPending}
                    onClick={() => resource.setScope("MINE")}
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    我的
                  </Button>
                  <Button
                    className="min-w-0 flex-1"
                    variant={resource.scope === "TEAM" ? "secondary" : "ghost"}
                    size="sm"
                    disabled={actionPending}
                    onClick={() => resource.setScope("TEAM")}
                  >
                    <UsersRound className="h-4 w-4" aria-hidden="true" />
                    团队
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">消息分类</p>
                <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
                  {TYPE_FILTERS.map((filter) => (
                    <Button
                      key={filter.value ?? "ALL"}
                      className="whitespace-nowrap"
                      variant={resource.type === filter.value ? "secondary" : "ghost"}
                      size="sm"
                      disabled={actionPending}
                      onClick={() => resource.setType(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">阅读状态</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((filter) => (
                    <Button
                      key={filter.value ?? "ALL"}
                      variant={resource.readStatus === filter.value ? "secondary" : "ghost"}
                      size="sm"
                      disabled={actionPending}
                      onClick={() => resource.setReadStatus(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {resource.actionMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status" aria-live="polite">
              {resource.actionMessage}
            </div>
          ) : null}

          {data.items.length === 0 ? (
            <NotificationEmptyState
              title="当前筛选下没有通知"
              description="新的任务、AI 报告、客户、培训或系统事件产生后，会按你的通知偏好出现在这里。"
              action={(resource.type || resource.readStatus) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resource.setType(undefined);
                    resource.setReadStatus(undefined);
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined}
            />
          ) : (
            <NotificationList
              items={data.items}
              pagination={data.pagination}
              readOnly={resource.scope === "TEAM"}
              readingId={resource.readingId}
              disabled={actionPending}
              onMarkRead={(id) => void resource.markRead(id)}
              onPageChange={resource.setPage}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
