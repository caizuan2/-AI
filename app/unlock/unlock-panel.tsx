"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Database, KeyRound, Loader2, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LICENSE_REACTIVATION_EVENT_KEY,
  type LicenseReactivationAppType,
  type LicenseReactivationReason
} from "@/lib/auth/license-reactivation";

type ActivateApiData = {
  ok: true;
  message: string;
  licenseActivated: true;
  reactivated: boolean;
  userId: string;
  historyScope: string;
  permission: LicenseReactivationAppType;
};

type ActivateApiEnvelope = {
  ok?: boolean;
  data?: ActivateApiData;
  message?: string;
  code?: string;
  error?: {
    message?: string;
  };
};

type UnlockPanelProps = {
  user: {
    id: string;
    maskedPhone: string;
    name: string;
    historyScope: string;
  };
  appType: LicenseReactivationAppType;
  nextPath: string;
  reason: LicenseReactivationReason | null;
};

const reasonMessages: Record<LicenseReactivationReason, string> = {
  disabled: "原卡密已被禁用。历史和知识资料仍保留，请使用新的未使用卡密恢复权限。",
  expired: "原卡密已过期。历史和知识资料仍保留，请使用新的未使用卡密恢复权限。",
  missing: "当前账号尚未绑定可用卡密，激活后即可继续使用原账号空间。",
  mismatch: "当前卡密权限不适用于这个入口，请使用与当前客户端匹配的新卡密。"
};

export function UnlockPanel({ user, appType, nextPath, reason }: UnlockPanelProps) {
  const router = useRouter();
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isReactivation = reason === "disabled" || reason === "expired" || reason === "mismatch";
  const requiredLicenseLabel = appType === "ingest_admin" ? "XT-INGEST" : "XT-USER";

  useEffect(() => {
    function handleLicenseReactivated(event: StorageEvent) {
      if (event.key !== LICENSE_REACTIVATION_EVENT_KEY || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as {
          userId?: string;
          permission?: LicenseReactivationAppType;
        };

        if (payload.userId === user.id && payload.permission === appType) {
          router.replace(nextPath);
          router.refresh();
        }
      } catch {
        // Ignore malformed local browser events; server-side permission checks remain authoritative.
      }
    }

    window.addEventListener("storage", handleLicenseReactivated);

    return () => {
      window.removeEventListener("storage", handleLicenseReactivated);
    };
  }, [appType, nextPath, router, user.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!licenseKey.trim()) {
      setError("请输入卡密。");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: licenseKey,
          appType
        })
      });
      const payload = await response.json().catch(() => null) as ActivateApiEnvelope | null;
      const data = payload?.data;

      if (!response.ok || !payload?.ok || !data?.ok) {
        throw new Error(payload?.message || payload?.error?.message || "卡密激活失败。");
      }

      if (
        !data.licenseActivated ||
        data.userId !== user.id ||
        data.historyScope !== user.historyScope ||
        data.permission !== appType
      ) {
        throw new Error("激活后的账号或权限校验不一致，请重新登录原账号后再试。");
      }

      setSuccess(data.message);
      setLicenseKey("");
      localStorage.setItem(
        LICENSE_REACTIVATION_EVENT_KEY,
        JSON.stringify({
          userId: data.userId,
          historyScope: data.historyScope,
          permission: data.permission,
          activatedAt: Date.now()
        })
      );

      window.setTimeout(() => {
        router.replace(nextPath);
        router.refresh();
      }, 900);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "卡密激活失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink px-10 py-10 text-white lg:flex lg:flex-col">
        <div className="login-grid absolute inset-0 opacity-[0.08]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-ink">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold">AI 知识库</p>
            <p className="text-xs text-slate-300">License Activation</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <KeyRound className="h-4 w-4" />
            License Required
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            使用新卡恢复原账号权限。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            更换卡密不会创建新账号，也不会清除原有对话、知识、文件或训练记录。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
              <Database className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-ink">AI 知识库</h1>
          </div>

          <div>
            <p className="text-sm font-medium text-teal-700">{user.name} · {user.maskedPhone}</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">
              {isReactivation ? "使用新卡密重新激活" : "输入卡密激活 AI 知识库"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {reason ? reasonMessages[reason] : "激活成功后会继续使用当前登录的原账号。"}
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              当前入口需要 <span className="font-semibold">{requiredLicenseLabel}</span> 卡密。请勿重新注册账号。
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              更换卡密不会创建新账号，不会清除历史和知识资料。卡密明文不会保存在浏览器中。
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">卡密</span>
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
                <LockKeyhole className="h-4 w-4 text-muted" />
                <Input
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  autoComplete="off"
                  className="h-auto border-0 bg-transparent p-0 uppercase shadow-none focus-visible:ring-0"
                  placeholder={`${requiredLicenseLabel}-XXXX-XXXX-XXXX`}
                />
              </span>
            </label>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            ) : null}

            <Button type="submit" disabled={loading || Boolean(success)} className="h-11 w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {isReactivation ? "使用新卡重新激活" : "立即激活"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
