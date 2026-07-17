"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Loader2, LockKeyhole, LogIn, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UserLicenseReactivationReason = "disabled" | "expired";

type ActivateApiResponse = {
  ok?: boolean;
  message?: string;
  code?: string;
  licenseActivated?: boolean;
};

export function UnlockPanel({
  user,
  reactivationReason = null
}: {
  user: { phone: string; name: string };
  reactivationReason?: UserLicenseReactivationReason | null;
}) {
  const router = useRouter();
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  async function goToLogin() {
    setLeaving(true);
    setError("");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store"
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!licenseKey.trim()) {
      setError("请输入卡密。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: licenseKey,
          user_id: user.phone
        })
      });
      const data = await response.json().catch(() => null) as ActivateApiResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || "卡密激活失败。");
      }

      localStorage.setItem("aikb_license_activated", "true");
      localStorage.setItem("aikb_license_code", data.code || licenseKey.trim());
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store"
      });
      router.replace("/login?activated=1");
      router.refresh();
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
          <span className="relative block h-11 w-11 overflow-hidden rounded-xl bg-white ring-1 ring-white/30">
            <Image
              src="/brand/xiaodong-ai-logo.png"
              alt="小董AI Logo"
              fill
              sizes="44px"
              className="object-cover"
              priority
            />
          </span>
          <div>
            <p className="text-base font-semibold">小董AI</p>
            <p className="text-xs text-slate-300">小董AI大脑🧠 + AI思考</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <KeyRound className="h-4 w-4" />
            用户端卡密激活
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            激活小董AI用户端
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            请输入超级管理员后台生成的用户端卡密，激活后即可进入 AI 业务助手。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="relative block h-11 w-11 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <Image
                src="/brand/xiaodong-ai-logo.png"
                alt="小董AI Logo"
                fill
                sizes="44px"
                className="object-cover"
                priority
              />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-ink">小董AI</h1>
          </div>

          <div>
            <p className="text-sm font-medium text-teal-700">{user.name} · {user.phone}</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">激活小董AI用户端</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              请输入超级管理员后台生成的用户端卡密，激活后即可进入 AI 业务助手。
            </p>
          </div>

          {reactivationReason ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {reactivationReason === "disabled" ? "当前卡密已被禁用" : "当前卡密已过期"}
                </p>
                <p className="mt-1 text-rose-600">
                  用户端功能已暂停，请输入新的有效用户端卡密重新激活，或返回登录切换账号。
                </p>
              </div>
            </div>
          ) : null}

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
                  placeholder="XT-USER-XXXX-XXXX-XXXX"
                />
              </span>
            </label>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              立即激活
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={loading || leaving}
              onClick={goToLogin}
              className="h-11 w-full"
            >
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              返回登录 / 换账号
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
