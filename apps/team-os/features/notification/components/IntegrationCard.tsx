"use client";

import * as React from "react";
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  IntegrationConfigSummary,
  IntegrationProvider,
  ProviderTestResult
} from "@/apps/team-os/features/notification/types";

interface ProviderField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

const PROVIDERS: Record<IntegrationProvider, {
  name: string;
  description: string;
  fields: ProviderField[];
}> = {
  WECHAT_WORK: {
    name: "企业微信",
    description: "连接企业微信应用，为未来的任务、教练和系统事件推送提供安全入口。",
    fields: [
      { key: "corpId", label: "企业 ID", placeholder: "输入新的 Corp ID" },
      { key: "agentId", label: "应用 Agent ID", placeholder: "输入新的 Agent ID" },
      { key: "corpSecret", label: "应用 Secret", placeholder: "输入新的 Secret", secret: true }
    ]
  },
  DINGTALK: {
    name: "钉钉",
    description: "连接钉钉企业应用，统一承接企业消息网关的安全推送能力。",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "输入新的 Client ID" },
      { key: "clientSecret", label: "Client Secret", placeholder: "输入新的 Client Secret", secret: true }
    ]
  },
  FEISHU: {
    name: "飞书",
    description: "连接飞书企业自建应用，为跨系统通知保留标准 Provider 接口。",
    fields: [
      { key: "appId", label: "App ID", placeholder: "输入新的 App ID" },
      { key: "appSecret", label: "App Secret", placeholder: "输入新的 App Secret", secret: true }
    ]
  }
};

function formatDate(value?: string) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
}

export function IntegrationCard({
  provider,
  integration,
  disabled = false,
  saving,
  testing,
  testResult,
  onSave,
  onTest
}: {
  provider: IntegrationProvider;
  integration: IntegrationConfigSummary | null;
  disabled?: boolean;
  saving: boolean;
  testing: boolean;
  testResult?: ProviderTestResult;
  onSave: (input: {
    provider: IntegrationProvider;
    enabled: boolean;
    config?: Record<string, string>;
  }) => Promise<boolean>;
  onTest: (provider: IntegrationProvider) => Promise<void>;
}) {
  const definition = PROVIDERS[provider];
  const [enabled, setEnabled] = React.useState(integration?.enabled ?? false);
  const [editingCredentials, setEditingCredentials] = React.useState(!integration?.configured);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const formId = React.useId();

  React.useEffect(() => {
    setEnabled(integration?.enabled ?? false);
    setEditingCredentials(!integration?.configured);
    setValues({});
    setValidationError(null);
  }, [integration]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    let config: Record<string, string> | undefined;
    if (editingCredentials) {
      const normalized = Object.fromEntries(
        definition.fields.map((field) => [field.key, (values[field.key] ?? "").trim()])
      );
      const missing = definition.fields.find((field) => !normalized[field.key]);
      if (missing) {
        setValidationError(`请填写${missing.label}。`);
        return;
      }
      config = normalized;
    }

    const saved = await onSave({ provider, enabled, config });
    if (saved) {
      setValues({});
      setEditingCredentials(false);
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="border-b border-slate-100 bg-slate-50/60">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <PlugZap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{definition.name}</CardTitle>
                <Badge variant={integration?.configured ? "default" : "outline"}>
                  {integration?.configured ? "已配置" : "未配置"}
                </Badge>
                {integration?.enabled ? <Badge variant="secondary">已启用</Badge> : null}
              </div>
              <CardDescription>{definition.description}</CardDescription>
            </div>
          </div>
          <Button
            variant={enabled ? "secondary" : "outline"}
            size="sm"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((current) => !current)}
            disabled={disabled || saving}
          >
            {enabled ? "连接已启用" : "连接已停用"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900 sm:flex-row sm:items-start">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">凭据采用只写模式</p>
            <p className="mt-1 leading-6 text-emerald-800">服务端响应不会返回 Secret 或连接配置；页面也不会读取、预填或回显已保存凭据。</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">连接凭据</p>
              <p className="mt-1 text-xs text-slate-500">{integration?.configured ? `最近更新：${formatDate(integration.updatedAt)}` : "需要录入一组新凭据后才能完成配置。"}</p>
            </div>
            {integration?.configured ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || saving}
                onClick={() => {
                  setEditingCredentials((current) => !current);
                  setValues({});
                  setValidationError(null);
                }}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {editingCredentials ? "取消更换" : "更换凭据"}
              </Button>
            ) : null}
          </div>

          {editingCredentials ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {definition.fields.map((field) => {
                const inputId = `${formId}-${field.key}`;
                return (
                  <label key={field.key} htmlFor={inputId} className={field.secret ? "sm:col-span-2" : undefined}>
                    <span className="mb-2 block text-xs font-medium text-slate-700">{field.label}</span>
                    <Input
                      id={inputId}
                      name={`${provider.toLowerCase()}_${field.key}_new`}
                      type={field.secret ? "password" : "text"}
                      autoComplete={field.secret ? "new-password" : "off"}
                      value={values[field.key] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                      disabled={disabled || saving}
                      spellCheck={false}
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              已保存凭据保持隐藏；不更换凭据时仅更新启用状态。
            </div>
          )}

          {validationError ? <p className="text-sm text-rose-700" role="alert">{validationError}</p> : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={disabled || saving}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {saving ? "正在安全保存…" : "保存连接"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !integration?.configured || testing || saving}
              onClick={() => void onTest(provider)}
            >
              {testing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {testing ? "正在测试…" : "测试连接"}
            </Button>
          </div>
        </form>

        {testResult ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">
            <p className="font-semibold">安全测试模式 · 未外发</p>
            <p className="mt-1 leading-6 text-blue-800">{testResult.reason}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
