"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Network, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCard } from "@/apps/team-os/features/notification/components/IntegrationCard";
import { NotificationCompanySelector } from "@/apps/team-os/features/notification/components/NotificationCompanySelector";
import { NotificationPageHeader } from "@/apps/team-os/features/notification/components/NotificationPageHeader";
import { NotificationSectionNavigation } from "@/apps/team-os/features/notification/components/NotificationSectionNavigation";
import {
  NotificationErrorState,
  NotificationForbiddenState,
  NotificationLoadingState
} from "@/apps/team-os/features/notification/components/NotificationState";
import { useIntegrations } from "@/apps/team-os/features/notification/hooks/useNotificationData";
import { INTEGRATION_PROVIDERS } from "@/apps/team-os/features/notification/types";

export function IntegrationsPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useIntegrations(initialCompanyId);
  const data = resource.data;
  const activeCompanyId = data?.companyId ?? resource.companyId;
  const actionPending = Boolean(resource.savingProvider || resource.testingProvider);
  const companyName = data?.companies.find((company) => company.id === data.companyId)?.name ?? "当前企业";

  const handleCompanyChange = React.useCallback((companyId: string) => {
    resource.selectCompany(companyId);
    router.replace(`/team-os/integrations?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <NotificationPageHeader
        eyebrow="Enterprise Integration Hub"
        title="企业连接"
        description="由企业负责人管理企业微信、钉钉与飞书连接。当前阶段仅提供安全 Provider 抽象和测试模式，不会向外部平台真实发送消息。"
      />
      <NotificationSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <NotificationLoadingState label="正在读取企业连接…" /> : resource.error?.code === "FORBIDDEN" ? (
        <NotificationForbiddenState description="只有 TEAM_OWNER 可以查看和管理企业级第三方连接配置。" />
      ) : resource.error ? (
        <NotificationErrorState message={resource.error.message} onRetry={() => void resource.reload()} title="企业连接加载失败" />
      ) : data && !data.canManage ? (
        <NotificationForbiddenState description="只有 TEAM_OWNER 可以查看和管理企业级第三方连接配置。" />
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
            {[
              { icon: ShieldCheck, title: "企业级隔离", description: "连接配置只在当前 companyId 范围内生效。" },
              { icon: LockKeyhole, title: "凭据不回显", description: "第三方 Secret 只允许写入新值，接口响应永不返回。" },
              { icon: Network, title: "安全测试模式", description: "Provider 测试会返回未外发结果，不伪造送达状态。" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex h-full gap-3 p-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {resource.actionMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status" aria-live="polite">
              {resource.actionMessage}
            </div>
          ) : null}

          <div className="space-y-5">
            {INTEGRATION_PROVIDERS.map((provider) => (
              <IntegrationCard
                key={`${data.companyId}:${provider}`}
                provider={provider}
                integration={data.integrations.find((item) => item.provider === provider) ?? null}
                disabled={actionPending}
                saving={resource.savingProvider === provider}
                testing={resource.testingProvider === provider}
                testResult={resource.testResults[provider]}
                onSave={resource.save}
                onTest={resource.test}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
