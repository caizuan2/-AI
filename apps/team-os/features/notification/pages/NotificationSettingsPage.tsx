"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Building2, LoaderCircle, Mail, MessageCircleMore, Save, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationCompanySelector } from "@/apps/team-os/features/notification/components/NotificationCompanySelector";
import { NotificationPageHeader } from "@/apps/team-os/features/notification/components/NotificationPageHeader";
import { NotificationPreferenceCard } from "@/apps/team-os/features/notification/components/NotificationPreferenceCard";
import { NotificationSectionNavigation } from "@/apps/team-os/features/notification/components/NotificationSectionNavigation";
import {
  NotificationErrorState,
  NotificationForbiddenState,
  NotificationLoadingState
} from "@/apps/team-os/features/notification/components/NotificationState";
import { useNotificationPreferences } from "@/apps/team-os/features/notification/hooks/useNotificationData";
import type { NotificationChannel } from "@/apps/team-os/features/notification/types";

const CHANNELS: Array<{
  channel: NotificationChannel;
  label: string;
  description: string;
  icon: typeof BellRing;
}> = [
  { channel: "IN_APP", label: "站内消息", description: "在 AI Team OS 消息中心接收通知。关闭后，显式创建的系统记录仍可保留，但网关不会主动选择该渠道。", icon: BellRing },
  { channel: "EMAIL", label: "邮件", description: "为未来的企业邮件通知保留个人接收偏好。当前阶段不执行真实邮件外发。", icon: Mail },
  { channel: "WECHAT", label: "企业微信", description: "允许消息网关在企业完成连接后选择企业微信渠道。", icon: MessageCircleMore },
  { channel: "DINGTALK", label: "钉钉", description: "允许消息网关在企业完成连接后选择钉钉渠道。", icon: Smartphone },
  { channel: "FEISHU", label: "飞书", description: "允许消息网关在企业完成连接后选择飞书渠道。", icon: Send }
];

export function NotificationSettingsPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useNotificationPreferences(initialCompanyId);
  const data = resource.data;
  const activeCompanyId = data?.companyId ?? resource.companyId;
  const companyName = data?.companies.find((company) => company.id === data.companyId)?.name ?? "当前企业";
  const dirty = data ? data.preferences.some((item) => (resource.draft[item.channel] ?? item.enabled) !== item.enabled) : false;

  const handleCompanyChange = React.useCallback((companyId: string) => {
    resource.selectCompany(companyId);
    router.replace(`/team-os/notifications/settings?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <NotificationPageHeader
        eyebrow="Notification Preferences"
        title="通知设置"
        description="管理当前账号的消息渠道偏好。个人偏好不包含任何企业连接凭据，也不会绕过企业级 Provider 权限。"
        actions={data ? (
          <Button disabled={!dirty || resource.saving} onClick={() => void resource.save()}>
            {resource.saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {resource.saving ? "正在保存…" : "保存偏好"}
          </Button>
        ) : undefined}
      />
      <NotificationSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <NotificationLoadingState label="正在读取通知偏好…" /> : resource.error?.code === "FORBIDDEN" ? (
        <NotificationForbiddenState description="只有当前企业的有效成员可以管理自己的通知渠道偏好。" />
      ) : resource.error ? (
        <NotificationErrorState message={resource.error.message} onRetry={() => void resource.reload()} title="通知设置加载失败" />
      ) : data ? (
        <>
          <NotificationCompanySelector
            companyId={data.companyId}
            companyName={companyName}
            companies={data.companies}
            disabled={resource.saving}
            onChange={handleCompanyChange}
          />

          <Card>
            <CardHeader>
              <CardTitle>个人渠道偏好</CardTitle>
              <CardDescription>偏好与当前登录账号绑定。第三方渠道还需要企业负责人在企业连接页完成配置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CHANNELS.map((item) => (
                <NotificationPreferenceCard
                  key={item.channel}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  enabled={resource.draft[item.channel] ?? false}
                  disabled={resource.saving}
                  onToggle={() => resource.toggle(item.channel)}
                />
              ))}
            </CardContent>
          </Card>

          {resource.actionMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status" aria-live="polite">
              {resource.actionMessage}
            </div>
          ) : null}

          <Card className="border-indigo-100 bg-indigo-50/40">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-950">需要配置企业平台？</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">TEAM_OWNER 可在企业连接页录入只写凭据并执行不外发的安全测试。</p>
              </div>
              <Link
                href="/team-os/integrations"
                className="focus-ring inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                前往企业连接
              </Link>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
